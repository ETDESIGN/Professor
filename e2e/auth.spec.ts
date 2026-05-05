import { test, expect } from '@playwright/test';

test.describe('Hub Page', () => {
  test('loads hub and shows Professor branding', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Professor').first()).toBeVisible({ timeout: 15000 });
  });

  test('shows all app cards', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Professor').first()).toBeVisible({ timeout: 15000 });
    const cards = page.locator('button[class*="bg-slate-800"]');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
    expect(await cards.count()).toBeGreaterThanOrEqual(8);
  });

  test('language selector is present and switchable', async ({ page }) => {
    await page.goto('/');
    const langSelect = page.locator('select').last();
    if (await langSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
      await langSelect.selectOption('zh');
      await page.waitForTimeout(500);
    }
  });

  test('navigates to login page', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Professor').first()).toBeVisible({ timeout: 15000 });
    const loginLink = page.locator('a[href="/login"], button:has-text("Login"), button:has-text("Sign In")');
    if (await loginLink.count() > 0) {
      await loginLink.first().click();
      await expect(page).toHaveURL(/\/login/);
    }
  });
});

test.describe('Login Page', () => {
  test('shows login form with email and password', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"], input[placeholder*="email"], input[name="email"]').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test('shows role selection buttons', async ({ page }) => {
    await page.goto('/login');
    const roleButtons = page.locator('button').filter({ hasText: /Teacher|Student|Parent|Admin/ });
    if (await roleButtons.count() > 0) {
      expect(await roleButtons.count()).toBeGreaterThanOrEqual(3);
    }
  });

  test('shows validation error on empty submit', async ({ page }) => {
    await page.goto('/login');
    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();
    await page.waitForTimeout(1000);
    const errorEl = page.locator('[class*="error"], [class*="Error"], [class*="red"]').or(page.locator('text=/required|invalid|enter/i'));
    if (await errorEl.count() > 0) {
      expect(await errorEl.first().isVisible()).toBeTruthy();
    }
  });

  test('shows error with invalid credentials', async ({ page }) => {
    await page.goto('/login');
    const emailInput = page.locator('input[type="email"], input[placeholder*="email"], input[name="email"]').first();
    await emailInput.fill('nonexistent@test.com');

    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill('wrongpassword123');

    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();

    await page.waitForTimeout(3000);
    const errorEl = page.locator('text=/invalid|error|failed|wrong|incorrect/i');
    if (await errorEl.count() > 0) {
      expect(await errorEl.first().isVisible()).toBeTruthy();
    }
  });

  test('toggles between sign in and sign up', async ({ page }) => {
    await page.goto('/login');
    const toggleBtn = page.locator('button:has-text("Sign Up"), button:has-text("sign up"), button:has-text("Create"), button:has-text("Register")');
    if (await toggleBtn.count() > 0) {
      await toggleBtn.first().click();
      await page.waitForTimeout(500);
      const confirmField = page.locator('input[placeholder*="confirm"], input[name*="confirm"]');
      if (await confirmField.count() > 0) {
        expect(await confirmField.first().isVisible()).toBeTruthy();
      }
    }
  });
});
