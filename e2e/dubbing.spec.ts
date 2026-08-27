// E2E: full video-dubbing flow (Task 12).
//
// Teacher creates a clip from e2e/fixtures/clip.mp4, marks 2 lines and assigns
// it → student A records a pass with the fake mic, publishes → student B sees
// it in Friends' videos and likes it → parent sees it in the gallery and
// deletes it. DB state is asserted between steps via supabase-js (RLS-
// permitted reads). Runs against the live dev project with throwaway fixtures
// (see e2e/dubbingFixtures.ts).
//
// Fake mic: Chromium launch flags grant getUserMedia + a tone audio device so
// MediaRecorder produces real (non-empty) blobs headlessly.
import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  setupFixtures, cleanupFixtures, loginWithEmail, sql, Fixtures, SUPABASE_URL,
} from './dubbingFixtures';

const CLIP_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/clip.mp4');

/**
 * SPA-navigate to a portal route. A full page.goto('/teacher/dubbing') makes
 * the app reload-loop in dev (session-restore flakiness), so push a history
 * entry + popstate instead — equivalent to the in-app sidebar links (verified
 * by hand: the sidebar click renders Dubbing clips reliably).
 */
async function gotoPortal(page: import('@playwright/test').Page, url: string) {
  await page.waitForTimeout(1000); // let post-login redirects settle
  await page.evaluate((u) => {
    window.history.pushState({}, '', u);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, url);
}

let fx: Fixtures;
let clipId = '';

// Fake mic for Chromium (this file only — does not affect other specs).
test.use({
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
});

test.describe.serial('Dubbing flow (teacher → student → peer → parent)', () => {
  test.beforeAll(async () => {
    test.skip(!existsSync(CLIP_PATH), 'e2e/fixtures/clip.mp4 missing');
    test.skip(!SUPABASE_URL, 'Requires Supabase config (.env)');
    fx = await setupFixtures();
  });

  test.afterAll(async () => {
    if (fx) await cleanupFixtures(fx);
  });

  test('teacher creates clip, marks 2 lines, assigns', async ({ page }) => {
    test.setTimeout(120_000);
    await loginWithEmail(page, fx.emails['teacher'], fx.password, 'teacher');
    await gotoPortal(page, '/teacher/dubbing');
    await expect(page.getByText('Dubbing clips')).toBeVisible({ timeout: 20000 });

    // Create flow: pick the fixture video (throwaway class is the only one,
    // pre-selected in the header select).
    await page.getByRole('button', { name: 'New clip' }).first().click();
    await page.setInputFiles('input[type="file"]', {
      name: 'clip.mp4',
      mimeType: 'video/mp4',
      buffer: readFileSync(CLIP_PATH),
    });
    await expect(page.getByText(/8\.\ds/)).toBeVisible({ timeout: 15000 });
    await page.locator('input[placeholder="e.g. At the restaurant"]').fill(fx.clipTitle);
    await page.getByRole('button', { name: /Create clip & start marking/ }).click();
    await expect(page.getByText('Edit clip script')).toBeVisible({ timeout: 20000 });

    // Mark 2 lines by seeking the <video> element (Mark in/out read
    // video.currentTime at click time).
    const video = page.locator('video').first();
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 15000 }).toBeGreaterThanOrEqual(1);

    const addLine = async (startSec: number, endSec: number, text: string) => {
      await video.evaluate((v, t) => { v.currentTime = t; }, startSec);
      await page.waitForTimeout(300);
      await page.getByRole('button', { name: /^Mark in/ }).click();
      await video.evaluate((v, t) => { v.currentTime = t; }, endSec);
      await page.waitForTimeout(300);
      await page.getByRole('button', { name: /^Mark out/ }).click();
      await page.locator('input[placeholder="Line text…"]').fill(text);
      await page.getByRole('button', { name: 'Add line' }).click();
    };
    await addLine(1, 3, 'Hello there, friend!');
    await addLine(4, 6, 'Nice to meet you.');
    await expect(page.getByText('Lines (2)')).toBeVisible();

    await page.getByRole('button', { name: 'Assign to class' }).click();
    await expect(page.getByText('Dubbing clips')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(fx.clipTitle).first()).toBeVisible();
    await expect(page.getByText('assigned', { exact: true })).toBeVisible();

    // DB: clip assigned with exactly 2 lines.
    const { data: clip } = await fx.clients['teacher']
      .from('dubbing_clips').select('id, status, title').eq('title', fx.clipTitle).single();
    expect(clip?.status).toBe('assigned');
    clipId = clip!.id;
    const { count } = await fx.clients['teacher']
      .from('dubbing_clip_lines').select('id', { count: 'exact', head: true }).eq('clip_id', clipId);
    expect(count).toBe(2);
  });

  test('student A records a pass and publishes', async ({ page }) => {
    test.setTimeout(180_000);
    test.skip(!clipId, 'teacher step failed');
    await loginWithEmail(page, fx.emails['student-a'], fx.password, 'student');
    await gotoPortal(page, '/student/dubbing');

    // Pick phase → open the clip.
    await expect(page.getByText(fx.clipTitle)).toBeVisible({ timeout: 20000 });
    await page.getByText(fx.clipTitle).click();
    await page.getByRole('button', { name: /Start dubbing/ }).click({ timeout: 20000 });

    // Record pass (fake mic). 8s video + lead time → pass_done.
    await page.getByRole('button', { name: /Tap to record/ }).click();
    await expect(page.getByText('Pass complete!')).toBeVisible({ timeout: 90_000 });

    await page.getByRole('button', { name: /See my results/ }).click();
    // Wait for the take to finish saving (Share button enabled), then publish.
    // Publish must NOT depend on the (slow/flaky) LLM score — tolerate pending.
    const share = page.getByRole('button', { name: /Share with class|Shared/ });
    await expect.poll(() => share.isEnabled(), { timeout: 60_000 }).toBeTruthy();
    await share.click();
    await expect(page.getByText('Shared with class')).toBeVisible({ timeout: 30_000 });

    // DB: one published dubbing owned by student A on this clip.
    const { data: dubs } = await fx.clients['student-a']
      .from('dubbings').select('id, is_published, student_id')
      .eq('clip_id', clipId).eq('student_id', fx.ids['student-a']);
    expect(dubs?.length).toBe(1);
    expect(dubs![0].is_published).toBe(true);
  });

  test('student B sees it in Friends\' videos and likes it', async ({ page }) => {
    test.setTimeout(120_000);
    test.skip(!clipId, 'teacher step failed');
    await loginWithEmail(page, fx.emails['student-b'], fx.password, 'student');
    await gotoPortal(page, '/student/dubbing');
    await page.getByLabel("Friends' videos").click();

    await expect(page.getByText('Class Gallery')).toBeVisible({ timeout: 20000 });
    // NOTE: the classmate's name shows as '?' — students cannot read other
    // students' profiles rows under RLS (listClassDubs joins profiles), so we
    // assert the published dub card via its actions instead of the name.
    const card = page.locator('.grid > div').filter({ has: page.getByRole('button', { name: 'Watch' }) }).first();
    await expect(card).toBeVisible({ timeout: 20000 });

    await page.getByLabel('Like').click();
    await expect(page.getByLabel('Unlike')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('button[aria-label="Unlike"] >> text=1')).toBeVisible();

    // DB: like row exists from student B.
    const { data: dubs } = await fx.clients['student-b']
      .from('dubbings').select('id').eq('clip_id', clipId).eq('is_published', true);
    expect(dubs?.length).toBe(1);
    // Like rows are not selectable by students under RLS (only the owner's
    // optimistic count) — verify persistence via the Management API instead.
    const likes = await sql(
      `SELECT student_id FROM public.dubbing_likes WHERE dubbing_id = '${dubs![0].id}'`,
    );
    expect(likes.length).toBe(1);
    expect(likes[0].student_id).toBe(fx.ids['student-b']);
  });

  test('parent sees the take in the gallery and deletes it', async ({ page }) => {
    test.setTimeout(120_000);
    test.skip(!clipId, 'teacher step failed');
    await loginWithEmail(page, fx.emails['parent'], fx.password, 'parent');
    await gotoPortal(page, '/parent/gallery');

    await expect(page.getByText(/Studio/)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(fx.clipTitle).first()).toBeVisible({ timeout: 20000 });

    // DB (pre-delete): parent can read the child's published take.
    const { data: before } = await fx.clients['parent']
      .from('dubbings').select('id').eq('clip_id', clipId);
    expect(before?.length).toBe(1);
    const dubId = before![0].id;

    await page.getByLabel('Delete take').first().click();
    await page.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByText('No Takes Yet')).toBeVisible({ timeout: 30000 });

    // DB (post-delete): row is gone for the parent.
    const { data: after } = await fx.clients['parent']
      .from('dubbings').select('id').eq('id', dubId);
    expect(after?.length).toBe(0);
  });
});
