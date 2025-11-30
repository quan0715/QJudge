import { test, expect } from '@playwright/test';

// Fixed accounts from Test_Agent.md
const student = { email: 'student@example.com', password: 'student123' };
const teacher = { email: 'teacher@example.com', password: 'teacher123' };
const admin = { email: 'admin@example.com', password: 'admin123' };

test.describe('Authentication', () => {
  
  test('Student Login', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', student.email);
    await page.fill('#password', student.password);
    await page.click('button[type="submit"]');

    // Should redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('Teacher Login', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', teacher.email);
    await page.fill('#password', teacher.password);
    await page.click('button[type="submit"]');
    
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('Admin Login', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', admin.email);
    await page.fill('#password', admin.password);
    await page.click('button[type="submit"]');
    
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
