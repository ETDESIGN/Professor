import { test, expect, type Page } from '@playwright/test';
import { loginAs } from './auth.helpers';

const VIEWPORTS = [
  { name: 'desktop-1280x720', width: 1280, height: 720 },
  { name: 'ipad-mini-landscape', width: 1133, height: 744 },
  { name: 'ipad-mini-portrait', width: 744, height: 1133 },
  { name: 'iphone-landscape', width: 844, height: 390 },
  { name: 'iphone-portrait', width: 390, height: 844 },
  { name: 'narrow-desktop', width: 900, height: 800 },
];

// /board is auth-gated: App.tsx bounces signed-out visitors to /login, and the
// login page has its own (unrelated) overflow — so this smoke must measure the
// board's connection-gate (NO SIGNAL) screen, not the login redirect. There are
// no shared e2e credentials (none in CI either), so fulfill the auth calls
// supabase-js makes and drive the real login form via the suite's loginAs.
const BOARD_E2E_USER = {
  id: '00000000-0000-4000-8000-000000000000',
  email: 'board-stage-e2e@test.local',
};
const authUser = {
  id: BOARD_E2E_USER.id,
  email: BOARD_E2E_USER.email,
  aud: 'authenticated',
  role: 'authenticated',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  app_metadata: { provider: 'email' },
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
};
const teacherProfile = [
  { id: BOARD_E2E_USER.id, email: BOARD_E2E_USER.email, role: 'teacher', full_name: 'Board Stage E2E', avatar_url: null },
];

async function signInAsTeacher(page: Page) {
  await page.route('**/auth/v1/token*', route => route.fulfill({
    json: {
      access_token: 'board-stage-e2e-fake-access-token',
      refresh_token: 'board-stage-e2e-fake-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: authUser,
    },
  }));
  await page.route('**/auth/v1/user*', route => route.fulfill({ json: authUser }));
  await page.route('**/rest/v1/profiles*', route => route.fulfill({ json: teacherProfile }));
  await loginAs(page, 'teacher');
  // loginAs resolves on the hub's client-side /teacher render; the hub then
  // full-page-replaces into the teacher portal entry (PortalRedirect in
  // App.tsx). Settle first — that replace can abort the /board goto below.
  await page.waitForLoadState('load');
  await page.waitForTimeout(300);
}

for (const vp of VIEWPORTS) {
  test(`board page causes no document overflow at ${vp.name}`, async ({ page }) => {
    await signInAsTeacher(page);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    try {
      await page.goto('/board');
    } catch (e) {
      // PortalRedirect's full-page replace can race and abort the navigation
      // (net::ERR_ABORTED) — retry once once the handoff has finished.
      if (!String(e).includes('ERR_ABORTED')) throw e;
      await page.goto('/board');
    }
    await page.waitForTimeout(1500);
    // Loud guard: if auth ever breaks we get bounced to /login and would be
    // measuring the wrong screen — fail on the URL, not on overflow numbers.
    expect(page.url()).toMatch(/\/board($|\?)/);
    const overflow = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - window.innerWidth,
      y: document.documentElement.scrollHeight - window.innerHeight,
    }));
    expect(overflow.x).toBeLessThanOrEqual(1);
    expect(overflow.y).toBeLessThanOrEqual(1);
  });
}
