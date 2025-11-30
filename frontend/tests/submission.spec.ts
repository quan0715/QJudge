import { test, expect } from '@playwright/test';

test.describe('Problem Submission', () => {
  
  // Helper to login before tests
  test.beforeEach(async ({ page }) => {
    // Login as student
    const student = { email: 'student@example.com', password: 'student123' };
    
    await page.goto('/login');
    await page.fill('#email', student.email);
    await page.fill('#password', student.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('Submit a solution to a problem', async ({ page }) => {
    // Navigate to problem list
    await page.goto('/problems');
    
    // Click on the first problem
    await page.locator('.problem-row').first().click(); 

    // Wait for navigation
    await expect(page).toHaveURL(/\/problems\/\d+/);

    // Wait for problem to load
    try {
      await expect(page.locator('.problem-solver')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('h2')).toBeVisible();
    } catch (e) {
      // Check for error messages
      if (await page.getByText('題目不存在').isVisible()) {
        throw new Error('Problem not found');
      }
      if (await page.getByText('無法載入題目資料').isVisible()) {
        throw new Error('Failed to load problem data');
      }
      throw e;
    }
    
    // Select Language (C++)
    await page.click('#language-selector');
    await page.getByRole('option', { name: 'C++' }).click();

    // Type code in Monaco Editor
    // Monaco is hard to type into directly with fill.
    // We click the editor area and type.
    await page.locator('.monaco-editor').first().click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('#include <iostream>\nint main() { std::cout << "Hello World" << std::endl; return 0; }');

    // Test Submission
    await page.click('button:has-text("測試提交")');
    
    // Confirm Modal
    await page.getByRole('dialog').getByText('確認提交').click();

    // Expect Result Modal
    await expect(page.getByRole('dialog', { name: '測試提交結果' })).toBeVisible();
    // Wait for result (polling)
    // This might take time, so we increase timeout if needed
    // We check if "Accepted" or "Wrong Answer" or "Compilation Error" appears
    // Or just check that the modal content updates from "Judging..."
  });
});
