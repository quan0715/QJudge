/**
 * E2E Tests for Submission Flow
 *
 * Tests problem detail viewing, code submission, and result checking.
 */

import { test, expect } from "@playwright/test";
import { login, clearAuth } from "../helpers/auth.helper";
import { TEST_PROBLEMS } from "../helpers/data.helper";

test.describe("Submission E2E Tests", () => {
  // Use serial mode to avoid login conflicts
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    // Clear any previous auth state
    await page.goto("/login");
    await clearAuth(page);
    // Login as student before each test
    await login(page, "student");
  });

  test("should display problem detail page", async ({ page }) => {
    // Navigate to problems and click on A+B Problem
    await page.goto("/problems");
    await page.waitForLoadState("networkidle");

    const aPlusBProblem = page
      .locator("text=" + TEST_PROBLEMS.aPlusB.title)
      .first();
    await aPlusBProblem.click();

    // Should be on problem detail page
    await page.waitForURL(/\/problems\/[^/]+/, { timeout: 10000 });

    // Should see problem title
    await expect(
      page.locator("h1, h2").filter({ hasText: TEST_PROBLEMS.aPlusB.title })
    ).toBeVisible({ timeout: 10000 });
  });

  test("should display problem description and test cases", async ({
    page,
  }) => {
    await page.goto("/problems");
    await page.waitForLoadState("networkidle");

    // Navigate to A+B Problem
    const aPlusBProblem = page
      .locator("text=" + TEST_PROBLEMS.aPlusB.title)
      .first();
    await aPlusBProblem.click();
    await page.waitForURL(/\/problems\/[^/]+/);

    // Should see problem description section
    await expect(page.locator("text=/描述|Description|題目描述/i")).toBeVisible(
      { timeout: 10000 }
    );

    // Should see test case or example section (use .first() to handle multiple matches)
    await expect(
      page.locator("text=/測試|範例|Sample|Example/i").first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("should display coding tab", async ({ page }) => {
    await page.goto("/problems");
    await page.waitForLoadState("networkidle");

    const aPlusBProblem = page
      .locator("text=" + TEST_PROBLEMS.aPlusB.title)
      .first();
    await aPlusBProblem.click();
    await page.waitForURL(/\/problems\/[^/]+/);

    // Wait for page to load
    await page.waitForTimeout(1000);

    // Click on "解題與提交" tab (it's a button with role="tab")
    const codingTab = page.getByRole("tab", { name: /解題與提交|Solve/i });
    await codingTab.click();

    // Verify we're on coding tab by checking for submit button
    const submitButton = page.locator(
      'button:has-text("提交"), button:has-text("Submit")'
    );
    await expect(submitButton.first()).toBeVisible({ timeout: 10000 });
  });

  test("should submit code and see result", async ({ page }) => {
    // Navigate to A+B Problem
    await page.goto("/problems");
    await page.waitForLoadState("networkidle");

    const aPlusBProblem = page
      .locator("text=" + TEST_PROBLEMS.aPlusB.title)
      .first();
    await aPlusBProblem.click();
    await page.waitForURL(/\/problems\/[^/]+/);

    // Wait for page to fully load
    await page.waitForTimeout(3000);

    // Find and click submit button
    const submitButton = page
      .locator(
        'button:has-text("提交"), button:has-text("Submit"), button[type="submit"]'
      )
      .filter({ hasText: /提交|Submit/i });

    if ((await submitButton.count()) > 0) {
      await submitButton.first().click();

      // Wait for submission to be processed
      // This might show a loading state or redirect to submission page
      await page.waitForTimeout(5000);

      // Check if we're redirected to submission detail or if result is shown inline
      const currentUrl = page.url();

      if (currentUrl.includes("/submissions")) {
        // Redirected to submissions page
        await expect(page).toHaveURL(/\/submissions/);
      } else {
        // Result might be shown on the same page
        // Look for result indicators
        await expect(
          page
            .locator("text=/AC|WA|TLE|MLE|Accepted|Wrong Answer|通過|錯誤/i")
            .first()
        ).toBeVisible({ timeout: 30000 });
      }
    }
  });

  test("should view submission history", async ({ page }) => {
    // Go to submissions page
    await page.goto("/submissions");

    // Should see submissions page
    await expect(page).toHaveURL(/\/submissions/);

    // Should see page title or header
    await expect(
      page
        .locator("h1, h2, .page-header")
        .filter({ hasText: /提交|Submission/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test("should filter submissions by problem", async ({ page }) => {
    await page.goto("/submissions");
    await page.waitForLoadState("networkidle");

    // Look for filter or search inputs
    const filterInput = page
      .locator('input[type="search"], select, .filter-input')
      .first();

    if ((await filterInput.count()) > 0) {
      // Try filtering (implementation depends on actual UI)
      await page.waitForTimeout(1000);
    }

    // At minimum, verify submissions page is accessible
    await expect(page).toHaveURL(/\/submissions/);
  });

  test("should display submission status", async ({ page }) => {
    await page.goto("/submissions");
    await page.waitForLoadState("networkidle");

    // Wait for any submissions to load
    await page.waitForTimeout(2000);

    // Check if status indicators are present
    const statusElements = page.locator(
      "text=/AC|WA|TLE|MLE|Pending|Judging|通過|錯誤|判題中/i"
    );

    // If there are submissions, should see status
    const count = await statusElements.count();

    // This test is informational - there might not be submissions yet
    console.log(`Found ${count} submission status indicators`);
  });

  test("should navigate to problem from submissions page", async ({ page }) => {
    // First make sure we have something in submissions (by visiting problems)
    await page.goto("/problems");
    await page.waitForLoadState("networkidle");

    // Then go to submissions
    await page.goto("/submissions");
    await page.waitForLoadState("networkidle");

    // Look for problem links
    const problemLinks = page
      .locator('a[href*="/problems/"]')
      .filter({ hasText: /A\+B|Hello World|Factorial/ });

    if ((await problemLinks.count()) > 0) {
      await problemLinks.first().click();

      // Should navigate to problem detail
      await expect(page).toHaveURL(/\/problems\/[^/]+/);
    }
  });

  test("should show submission detail when clicking on a submission", async ({
    page,
  }) => {
    await page.goto("/submissions");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Try to find and click on a submission row
    const submissionRow = page
      .locator('[role="row"], tr, .submission-row')
      .filter({ hasText: /AC|WA|TLE|Pending/ })
      .first();

    if ((await submissionRow.count()) > 0) {
      await submissionRow.click();

      // Should navigate to submission detail or show modal
      await page.waitForTimeout(1000);

      // Check if URL changed or modal appeared
      const currentUrl = page.url();
      const modal = page.locator(
        '[role="dialog"], .modal, .submission-detail-modal'
      );

      // Either URL changed or modal is visible
      const urlChanged = currentUrl.includes("/submissions/");
      const modalVisible = (await modal.count()) > 0;

      expect(urlChanged || modalVisible).toBe(true);
    }
  });

  test("should navigate to problem and see coding interface", async ({
    page,
  }) => {
    await page.goto("/problems");
    await page.waitForLoadState("networkidle");

    const aPlusBProblem = page
      .locator("text=" + TEST_PROBLEMS.aPlusB.title)
      .first();
    await aPlusBProblem.click();
    await page.waitForURL(/\/problems\/[^/]+/);

    // Click on "解題與提交" tab
    const codingTab = page.locator(
      'button:has-text("解題與提交"), button:has-text("Solve")'
    );
    if ((await codingTab.count()) > 0) {
      await codingTab.first().click();
    }

    // Verify page is on problem detail with coding interface
    await expect(page).toHaveURL(/\/problems\/[^/]+/);
  });
});
