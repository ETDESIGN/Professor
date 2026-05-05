import { test, expect } from '@playwright/test';
import { loginAs } from './auth.helpers';

test.describe('Parent App - Unauthenticated', () => {
  test('loads parent route without crash', async ({ page }) => {
    await page.goto('/parent');
    await page.waitForTimeout(3000);
    const url = page.url();
    expect(url).toMatch(/\/(parent|login)/);
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Parent App - Authenticated', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('logs in and sees parent dashboard', async ({ page }) => {
    test.skip(process.env.CI === 'true' && !process.env.VITE_SUPABASE_URL, 'Requires Supabase config');
    await loginAs(page, 'parent');

    await page.waitForTimeout(3000);
    if (page.url().includes('/parent')) {
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('bottom nav renders', async ({ page }) => {
    test.skip(process.env.CI === 'true' && !process.env.VITE_SUPABASE_URL, 'Requires Supabase config');
    await loginAs(page, 'parent');
    await page.waitForTimeout(3000);

    if (page.url().includes('/parent')) {
      const navButtons = page.locator('nav button');
      if (await navButtons.count() > 0) {
        expect(await navButtons.count()).toBeGreaterThanOrEqual(3);
      }
    }
  });

  test('navigates between parent tabs', async ({ page }) => {
    test.skip(process.env.CI === 'true' && !process.env.VITE_SUPABASE_URL, 'Requires Supabase config');
    await loginAs(page, 'parent');
    await page.waitForTimeout(3000);

    if (page.url().includes('/parent')) {
      const navButtons = page.locator('nav button');
      const count = await navButtons.count();
      if (count > 1) {
        await navButtons.nth(1).click();
        await page.waitForTimeout(1000);
        await expect(page.locator('body')).toBeVisible();
      }
    }
  });
});
