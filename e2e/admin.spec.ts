import { test, expect } from '@playwright/test';

test.describe('Admin Dashboard', () => {
  test('loads admin route without crash', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForTimeout(3000);
    const url = page.url();
    expect(url).toMatch(/\/(admin|login)/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('admin page renders body content', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForTimeout(3000);
    const bodyContent = await page.locator('body').textContent();
    expect(bodyContent?.length).toBeGreaterThan(0);
  });
});
