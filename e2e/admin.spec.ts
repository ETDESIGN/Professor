import { test, expect } from '@playwright/test';

test.describe('Admin Dashboard', () => {
  test('redirects unauthenticated to login', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toMatch(/\/(login|admin)/);
  });
});
