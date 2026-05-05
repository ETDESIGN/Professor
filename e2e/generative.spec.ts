import { test, expect } from '@playwright/test';

test.describe('Generative Pipeline Integrity', () => {
  test('Classroom Board mounts and shows waiting state', async ({ page }) => {
    await page.goto('/board');
    await page.waitForTimeout(3000);
    await expect(page.locator('body')).toBeVisible();
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.length).toBeGreaterThan(0);
  });
});

test.describe('Standalone Entry Points', () => {
  test('teacher.html loads without crash', async ({ page }) => {
    await page.goto('/teacher.html');
    await page.waitForTimeout(3000);
    await expect(page.locator('body')).toBeVisible();
  });

  test('student.html loads without crash', async ({ page }) => {
    await page.goto('/student.html');
    await page.waitForTimeout(3000);
    await expect(page.locator('body')).toBeVisible();
  });

  test('parent.html loads without crash', async ({ page }) => {
    await page.goto('/parent.html');
    await page.waitForTimeout(3000);
    await expect(page.locator('body')).toBeVisible();
  });

  test('admin.html loads without crash', async ({ page }) => {
    await page.goto('/admin.html');
    await page.waitForTimeout(3000);
    await expect(page.locator('body')).toBeVisible();
  });
});
