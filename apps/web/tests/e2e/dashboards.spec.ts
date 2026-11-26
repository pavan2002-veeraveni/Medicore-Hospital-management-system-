import { test, expect } from '@playwright/test';

test.describe('MediCore E2E Role Dashboards & Auth', () => {
  test('landing page renders navigation and role summary', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('MediCore')).toBeVisible();
    await expect(page.getByText('Sign In to Dashboard')).toBeVisible();
  });

  test('login page renders and validates credentials', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('Welcome to MediCore')).toBeVisible();
    await page.fill('input[type="email"]', 'patient1@medicore.local');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');
  });
});
