import { Page, expect } from '@playwright/test';

export const TEST_USERS = {
  teacher: {
    email: process.env.E2E_TEACHER_EMAIL || 'teacher@test.com',
    password: process.env.E2E_TEACHER_PASSWORD || 'testpassword123',
  },
  student: {
    email: process.env.E2E_STUDENT_EMAIL || 'student@test.com',
    password: process.env.E2E_STUDENT_PASSWORD || 'testpassword123',
  },
  parent: {
    email: process.env.E2E_PARENT_EMAIL || 'parent@test.com',
    password: process.env.E2E_PARENT_PASSWORD || 'testpassword123',
  },
};

export async function loginAs(page: Page, role: 'teacher' | 'student' | 'parent') {
  const user = TEST_USERS[role];
  await page.goto('/login');

  await page.waitForSelector('input[type="email"], input[placeholder*="email"], input[name="email"]', { timeout: 10000 });

  const emailInput = page.locator('input[type="email"], input[placeholder*="email"], input[name="email"]').first();
  await emailInput.fill(user.email);

  const passwordInput = page.locator('input[type="password"], input[placeholder*="password"], input[name="password"]').first();
  await passwordInput.fill(user.password);

  const roleButtons = page.locator(`button:has-text("${role.charAt(0).toUpperCase() + role.slice(1)}")`);
  if (await roleButtons.count() > 0) {
    const isVisible = await roleButtons.first().isVisible();
    if (isVisible) {
      await roleButtons.first().click();
    }
  }

  const submitBtn = page.locator('button[type="submit"]').first();
  await submitBtn.click();

  await page.waitForURL(/\/(teacher|student|parent)/, { timeout: 15000 }).catch(() => {});
}

export async function loginViaApi(page: Page, role: 'teacher' | 'student' | 'parent') {
  const user = TEST_USERS[role];
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    await loginAs(page, role);
    return;
  }

  try {
    const response = await page.request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      headers: {
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      data: {
        email: user.email,
        password: user.password,
      },
    });

    if (response.ok()) {
      const { access_token, refresh_token } = await response.json();

      await page.goto('/');
      await page.evaluate(({ accessToken, refreshToken, url }) => {
        const storageKey = `sb-${new URL(url).hostname.replace(/[^a-zA-Z0-9]/g, '-')}-auth-token`;
        localStorage.setItem(storageKey, JSON.stringify({
          access_token: accessToken,
          refresh_token: refreshToken,
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: {},
        }));
      }, { accessToken: access_token, refreshToken: refresh_token, url: supabaseUrl });
    } else {
      await loginAs(page, role);
    }
  } catch {
    await loginAs(page, role);
  }
}

export async function expectPageReady(page: Page, expectedText?: string, timeout = 15000) {
  if (expectedText) {
    await expect(page.locator(`text=${expectedText}`).first()).toBeVisible({ timeout });
  }
  await expect(page.locator('body')).toBeVisible();
}
