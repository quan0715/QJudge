import { test, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the auth state path
const authFile = (role: string) => path.join(__dirname, '../../.auth', `${role}.json`);

test.describe('Authentication Demo', () => {

  test.describe('Student Context', () => {
    test.use({ storageState: authFile('student') });

    test('Access App as Student', async ({ page }) => {
      await page.goto('/dashboard');
      // Success means we are not redirected to /login
      await expect(page).not.toHaveURL(/\/login/);
      
      // We might be on /dashboard or /onboarding depending on user state
      const url = page.url();
      console.log(`Student landed on: ${url}`);
      expect(url).toMatch(/\/dashboard|\/onboarding/);
      
      // Verify user info from localStorage
      const userStr = await page.evaluate(() => localStorage.getItem('user'));
      const user = JSON.parse(userStr || '{}');
      expect(user.email).toBe('student@example.com');
    });
  });

  test.describe('Teacher Context', () => {
    test.use({ storageState: authFile('teacher') });

    test('Access App as Teacher', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page).not.toHaveURL(/\/login/);
      
      const url = page.url();
      console.log(`Teacher landed on: ${url}`);
      expect(url).toMatch(/\/dashboard|\/onboarding/);
      
      const userStr = await page.evaluate(() => localStorage.getItem('user'));
      const user = JSON.parse(userStr || '{}');
      expect(user.email).toBe('teacher@example.com');
    });
  });

  test.describe('Admin Context', () => {
    test.use({ storageState: authFile('admin') });

    test('Access App as Admin', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page).not.toHaveURL(/\/login/);
      
      const url = page.url();
      console.log(`Admin landed on: ${url}`);
      expect(url).toMatch(/\/dashboard|\/onboarding/);
      
      const userStr = await page.evaluate(() => localStorage.getItem('user'));
      const user = JSON.parse(userStr || '{}');
      expect(user.email).toBe('admin@example.com');
    });
  });
});
