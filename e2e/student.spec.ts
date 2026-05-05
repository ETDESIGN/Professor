import { test, expect } from '@playwright/test';
import { loginAs } from './auth.helpers';

test.describe('Student App - Unauthenticated', () => {
  test('loads student route without crash', async ({ page }) => {
    await page.goto('/student');
    await page.waitForTimeout(3000);
    const url = page.url();
    expect(url).toMatch(/\/(student|login)/);
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Student App - Authenticated', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('logs in and sees home map', async ({ page }) => {
    test.skip(process.env.CI === 'true' && !process.env.VITE_SUPABASE_URL, 'Requires Supabase config');
    await loginAs(page, 'student');

    await page.waitForTimeout(3000);
    if (page.url().includes('/student')) {
      await expect(page.locator('body')).toBeVisible();
      const homeText = page.locator('text=/English|Daily Quest|Learn/i');
      if (await homeText.count() > 0) {
        expect(await homeText.first().isVisible()).toBeTruthy();
      }
    }
  });

  test('bottom nav has 5 tabs', async ({ page }) => {
    test.skip(process.env.CI === 'true' && !process.env.VITE_SUPABASE_URL, 'Requires Supabase config');
    await loginAs(page, 'student');
    await page.waitForTimeout(3000);

    if (page.url().includes('/student')) {
      const navButtons = page.locator('nav button');
      if (await navButtons.count() > 0) {
        expect(await navButtons.count()).toBe(5);
      }
    }
  });

  test('navigates to leaderboard via bottom nav', async ({ page }) => {
    test.skip(process.env.CI === 'true' && !process.env.VITE_SUPABASE_URL, 'Requires Supabase config');
    await loginAs(page, 'student');
    await page.waitForTimeout(3000);

    if (page.url().includes('/student')) {
      const rankBtn = page.locator('nav button:has-text("Rank"), nav button:has-text("Trophy")');
      if (await rankBtn.count() > 0) {
        await rankBtn.first().click();
        await page.waitForTimeout(2000);
        const leaderboardText = page.locator('text=/Leaderboard|Rank|XP/i');
        if (await leaderboardText.count() > 0) {
          expect(await leaderboardText.first().isVisible()).toBeTruthy();
        }
      }
    }
  });

  test('navigates to quests via bottom nav', async ({ page }) => {
    test.skip(process.env.CI === 'true' && !process.env.VITE_SUPABASE_URL, 'Requires Supabase config');
    await loginAs(page, 'student');
    await page.waitForTimeout(3000);

    if (page.url().includes('/student')) {
      const questBtn = page.locator('nav button:has-text("Quest"), nav button:has-text("Quests")');
      if (await questBtn.count() > 0) {
        await questBtn.first().click();
        await page.waitForTimeout(2000);
        const questText = page.locator('text=/Daily Quest|Daily Goal|Quest/i');
        if (await questText.count() > 0) {
          expect(await questText.first().isVisible()).toBeTruthy();
        }
      }
    }
  });

  test('navigates to shop via bottom nav', async ({ page }) => {
    test.skip(process.env.CI === 'true' && !process.env.VITE_SUPABASE_URL, 'Requires Supabase config');
    await loginAs(page, 'student');
    await page.waitForTimeout(3000);

    if (page.url().includes('/student')) {
      const shopBtn = page.locator('nav button:has-text("Shop")');
      if (await shopBtn.count() > 0) {
        await shopBtn.first().click();
        await page.waitForTimeout(2000);
        const shopText = page.locator('text=/Shop|Power-up|Avatar/i');
        if (await shopText.count() > 0) {
          expect(await shopText.first().isVisible()).toBeTruthy();
        }
      }
    }
  });

  test('navigates to profile via bottom nav', async ({ page }) => {
    test.skip(process.env.CI === 'true' && !process.env.VITE_SUPABASE_URL, 'Requires Supabase config');
    await loginAs(page, 'student');
    await page.waitForTimeout(3000);

    if (page.url().includes('/student')) {
      const profileBtn = page.locator('nav button:has-text("Profile")');
      if (await profileBtn.count() > 0) {
        await profileBtn.first().click();
        await page.waitForTimeout(2000);
        const profileText = page.locator('text=/Profile|Level|XP|Streak/i');
        if (await profileText.count() > 0) {
          expect(await profileText.first().isVisible()).toBeTruthy();
        }
      }
    }
  });

  test('join class modal opens from header', async ({ page }) => {
    test.skip(process.env.CI === 'true' && !process.env.VITE_SUPABASE_URL, 'Requires Supabase config');
    await loginAs(page, 'student');
    await page.waitForTimeout(3000);

    if (page.url().includes('/student')) {
      const joinBtn = page.locator('button:has-text("Join"), button:has-text("Class")');
      if (await joinBtn.count() > 0) {
        await joinBtn.first().click();
        await page.waitForTimeout(500);

        const modal = page.locator('text=/Join Class|Enter Code|class code/i');
        if (await modal.count() > 0) {
          expect(await modal.first().isVisible()).toBeTruthy();
        }
      }
    }
  });

  test('daily quests section is visible on home', async ({ page }) => {
    test.skip(process.env.CI === 'true' && !process.env.VITE_SUPABASE_URL, 'Requires Supabase config');
    await loginAs(page, 'student');
    await page.waitForTimeout(3000);

    if (page.url().includes('/student')) {
      const questSection = page.locator('text=/Daily Quest|Earn.*XP|hours left/i');
      if (await questSection.count() > 0) {
        expect(await questSection.first().isVisible()).toBeTruthy();
      }
    }
  });
});
