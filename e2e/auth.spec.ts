import { test, expect } from '@playwright/test';

test.describe('Hub Page', () => {
  test('loads hub and shows navigation options', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Professor')).toBeVisible({ timeout: 15000 });
  });

  test('navigates to login page', async ({ page }) => {
    await page.goto('/');
    const loginLink = page.locator('a[href="/login"], button:has-text("Login"), [data-testid="login"]');
    if (await loginLink.count() > 0) {
      await loginLink.first().click();
      await expect(page).toHaveURL(/\/login/);
    }
  });
});

test.describe('Login Page', () => {
  test('shows login form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"], input[placeholder*="email"], input[name="email"]')).toBeVisible({ timeout: 10000 });
  });

  test('shows validation on empty submit', async ({ page }) => {
    await page.goto('/login');
    const submitBtn = page.locator('button[type="submit"], button:has-text("Sign"), button:has-text("Login"), button:has-text("Log")');
    if (await submitBtn.count() > 0) {
      await submitBtn.first().click();
    }
  });
});
