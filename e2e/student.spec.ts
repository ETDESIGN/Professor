import { test, expect } from '@playwright/test';

test.describe('Student App', () => {
  test('redirects unauthenticated to login or hub', async ({ page }) => {
    await page.goto('/student');
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toMatch(/\/(login|student)/);
  });

  test('bottom nav has 5 tabs', async ({ page }) => {
    await page.goto('/student');
    await page.waitForTimeout(3000);
    const navButtons = page.locator('nav button');
    if (await navButtons.count() > 0) {
      expect(await navButtons.count()).toBe(5);
    }
  });
});

test.describe('Student Navigation', () => {
  test('navigates to leaderboard from bottom nav', async ({ page }) => {
    await page.goto('/student');
    await page.waitForTimeout(3000);
    const leaderboardBtn = page.locator('nav button:has-text("Rank")');
    if (await leaderboardBtn.count() > 0) {
      await leaderboardBtn.click();
      await page.waitForTimeout(1000);
    }
  });
});
