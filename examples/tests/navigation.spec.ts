import { test, expect } from '@playwright/test';

test.describe('Playwright docs navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/docs/intro');
  });

  test('page has installation section', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Installation' })).toBeVisible();
  });

  test('sidebar is visible', async ({ page }) => {
    await expect(page.locator('nav')).toBeVisible();
  });
});
