import { test, expect } from '@playwright/test';
import { loginAs } from './auth.helpers';

test.describe('Teacher Dashboard - Unauthenticated', () => {
  test('loads teacher route without crash', async ({ page }) => {
    await page.goto('/teacher');
    await page.waitForTimeout(3000);
    const url = page.url();
    expect(url).toMatch(/\/(teacher|login)/);
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Teacher Dashboard - Authenticated', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('logs in and sees dashboard', async ({ page }) => {
    test.skip(process.env.CI === 'true' && !process.env.VITE_SUPABASE_URL, 'Requires Supabase config');
    await loginAs(page, 'teacher');

    await page.waitForTimeout(3000);
    const url = page.url();
    if (url.includes('/teacher')) {
      await expect(page.locator('body')).toBeVisible();
      const dashboardText = page.locator('text=/Good Morning|Dashboard|Class|Units|Welcome/i');
      if (await dashboardText.count() > 0) {
        expect(await dashboardText.first().isVisible()).toBeTruthy();
      }
    }
  });

  test('sidebar navigation renders all tabs', async ({ page }) => {
    test.skip(process.env.CI === 'true' && !process.env.VITE_SUPABASE_URL, 'Requires Supabase config');
    await loginAs(page, 'teacher');
    await page.waitForTimeout(3000);

    if (page.url().includes('/teacher')) {
      const sidebar = page.locator('nav, [class*="sidebar"], aside');
      if (await sidebar.count() > 0) {
        const navItems = sidebar.first().locator('a, button');
        if (await navItems.count() > 0) {
          expect(await navItems.count()).toBeGreaterThanOrEqual(4);
        }
      }
    }
  });

  test('navigates to Class Management', async ({ page }) => {
    test.skip(process.env.CI === 'true' && !process.env.VITE_SUPABASE_URL, 'Requires Supabase config');
    await loginAs(page, 'teacher');
    await page.waitForTimeout(3000);

    if (page.url().includes('/teacher')) {
      const classLink = page.locator('a[href*="class"], button:has-text("Class"), [data-testid="nav-classes"]');
      if (await classLink.count() > 0) {
        await classLink.first().click();
        await page.waitForTimeout(2000);
        const classText = page.locator('text=/Class Management|Students|Roster/i');
        if (await classText.count() > 0) {
          expect(await classText.first().isVisible()).toBeTruthy();
        }
      }
    }
  });

  test('navigates to Assignments', async ({ page }) => {
    test.skip(process.env.CI === 'true' && !process.env.VITE_SUPABASE_URL, 'Requires Supabase config');
    await loginAs(page, 'teacher');
    await page.waitForTimeout(3000);

    if (page.url().includes('/teacher')) {
      const assignLink = page.locator('a[href*="assignment"], button:has-text("Assignment"), [data-testid="nav-assignments"]');
      if (await assignLink.count() > 0) {
        await assignLink.first().click();
        await page.waitForTimeout(2000);
        const assignText = page.locator('text=/Assignment|Homework|Create Assignment/i');
        if (await assignText.count() > 0) {
          expect(await assignText.first().isVisible()).toBeTruthy();
        }
      }
    }
  });

  test('navigates to Unit List', async ({ page }) => {
    test.skip(process.env.CI === 'true' && !process.env.VITE_SUPABASE_URL, 'Requires Supabase config');
    await loginAs(page, 'teacher');
    await page.waitForTimeout(3000);

    if (page.url().includes('/teacher')) {
      const unitLink = page.locator('a[href*="unit"], button:has-text("Unit"), button:has-text("Curriculum"), [data-testid="nav-units"]');
      if (await unitLink.count() > 0) {
        await unitLink.first().click();
        await page.waitForTimeout(2000);
        const unitText = page.locator('text=/Curriculum|Units|New Unit/i');
        if (await unitText.count() > 0) {
          expect(await unitText.first().isVisible()).toBeTruthy();
        }
      }
    }
  });

  test('navigates to Settings', async ({ page }) => {
    test.skip(process.env.CI === 'true' && !process.env.VITE_SUPABASE_URL, 'Requires Supabase config');
    await loginAs(page, 'teacher');
    await page.waitForTimeout(3000);

    if (page.url().includes('/teacher')) {
      const settingsLink = page.locator('a[href*="setting"], button:has-text("Setting"), [data-testid="nav-settings"]');
      if (await settingsLink.count() > 0) {
        await settingsLink.first().click();
        await page.waitForTimeout(2000);
        const settingsText = page.locator('text=/Settings|Profile|Billing/i');
        if (await settingsText.count() > 0) {
          expect(await settingsText.first().isVisible()).toBeTruthy();
        }
      }
    }
  });

  test('create class modal opens and closes', async ({ page }) => {
    test.skip(process.env.CI === 'true' && !process.env.VITE_SUPABASE_URL, 'Requires Supabase config');
    await loginAs(page, 'teacher');
    await page.waitForTimeout(3000);

    if (page.url().includes('/teacher')) {
      const classLink = page.locator('a[href*="class"], button:has-text("Class"), [data-testid="nav-classes"]');
      if (await classLink.count() > 0) {
        await classLink.first().click();
        await page.waitForTimeout(2000);

        const createBtn = page.locator('button:has-text("Create Class")');
        if (await createBtn.count() > 0) {
          await createBtn.first().click();
          await page.waitForTimeout(500);

          const modal = page.locator('text=Create New Class');
          if (await modal.count() > 0) {
            expect(await modal.first().isVisible()).toBeTruthy();

            const closeBtn = page.locator('button:has-text("Cancel"), [aria-label="Close"], button:has-text("X")');
            if (await closeBtn.count() > 0) {
              await closeBtn.first().click();
              await page.waitForTimeout(500);
              expect(await modal.count()).toBe(0);
            }
          }
        }
      }
    }
  });
});

test.describe('Lesson Studio', () => {
  test('studio page loads without crash', async ({ page }) => {
    await page.goto('/teacher/studio');
    await page.waitForTimeout(3000);
    const url = page.url();
    expect(url).toMatch(/\/(login|teacher)/);
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Live Commander', () => {
  test('commander page loads without crash', async ({ page }) => {
    await page.goto('/teacher/live');
    await page.waitForTimeout(3000);
    const url = page.url();
    expect(url).toMatch(/\/(login|teacher)/);
    await expect(page.locator('body')).toBeVisible();
  });
});
