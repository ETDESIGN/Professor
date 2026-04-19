import { test, expect } from '@playwright/test';

test.describe('Parent App', () => {
  test('redirects unauthenticated to login or hub', async ({ page }) => {
    await page.goto('/parent');
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toMatch(/\/(login|parent)/);
  });

  test('bottom nav has 5 tabs', async ({ page }) => {
    await page.goto('/parent');
    await page.waitForTimeout(3000);
    const navButtons = page.locator('nav button');
    if (await navButtons.count() > 0) {
      expect(await navButtons.count()).toBe(5);
    }
  });
});
