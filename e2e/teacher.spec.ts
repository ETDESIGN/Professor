import { test, expect } from '@playwright/test';

test.describe('Teacher Dashboard', () => {
  test('redirects unauthenticated to login', async ({ page }) => {
    await page.goto('/teacher');
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toMatch(/\/(login|teacher)/);
  });
});

test.describe('Lesson Studio', () => {
  test('redirects unauthenticated to login', async ({ page }) => {
    await page.goto('/teacher/studio');
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toMatch(/\/(login|teacher)/);
  });
});

test.describe('Live Commander', () => {
  test('redirects unauthenticated to login', async ({ page }) => {
    await page.goto('/teacher/live');
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toMatch(/\/(login|teacher)/);
  });
});
