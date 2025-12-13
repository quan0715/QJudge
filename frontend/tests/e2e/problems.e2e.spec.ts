/**
 * E2E Tests for Problem List
 *
 * Tests problem list display and navigation to problem details.
 */

import { test, expect } from "@playwright/test";
import { login, clearAuth } from "../helpers/auth.helper";
import { TEST_PROBLEMS } from "../helpers/data.helper";

test.describe("Problem List E2E Tests", () => {
  // Use serial mode to avoid login conflicts
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    // Clear any previous auth state
    await page.goto("/login");
    await clearAuth(page);
    // Login as student before each test
    await login(page, "student");
  });

  test("should display problem list page", async ({ page }) => {
    // Navigate to problems page
    await page.goto("/problems");

    // Should see problem list page
    await expect(page).toHaveURL(/\/problems/);

    // Should see page header/title
    await expect(
      page.locator("h1, h2, .page-header").filter({ hasText: /題目|Problem/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test("should display A+B Problem in the list", async ({ page }) => {
    await page.goto("/problems");
    await page.waitForLoadState("networkidle");

    // Should see A+B Problem (wait longer for data to load)
    await expect(
      page.locator("text=" + TEST_PROBLEMS.aPlusB.title).first()
    ).toBeVisible({ timeout: 15000 });
  });

  test("should display Hello World Problem in the list", async ({ page }) => {
    await page.goto("/problems");
    await page.waitForLoadState("networkidle");

    // Should see Hello World
    await expect(
      page.locator("text=" + TEST_PROBLEMS.helloWorld.title).first()
    ).toBeVisible({ timeout: 15000 });
  });

  test("should display difficulty badges", async ({ page }) => {
    await page.goto("/problems");
    await page.waitForLoadState("networkidle");

    // Check if difficulty is displayed (Easy badge)
    const difficultyElements = page.locator("text=/easy|簡單|EASY/i");
    await expect(difficultyElements.first()).toBeVisible({ timeout: 15000 });
  });

  test("should navigate to problem detail when clicking on a problem", async ({
    page,
  }) => {
    await page.goto("/problems");
    await page.waitForLoadState("networkidle");

    // Wait for A+B Problem to appear
    const aPlusBProblem = page
      .locator("text=" + TEST_PROBLEMS.aPlusB.title)
      .first();
    await expect(aPlusBProblem).toBeVisible({ timeout: 15000 });

    // Click on A+B Problem
    await aPlusBProblem.click();

    // Should navigate to problem detail page
    await page.waitForURL(/\/problems\/[^/]+/, { timeout: 10000 });

    // Should see problem title on detail page
    await expect(
      page.locator("h1, h2").filter({ hasText: TEST_PROBLEMS.aPlusB.title })
    ).toBeVisible({ timeout: 10000 });
  });

  test("should access problems page from navigation menu", async ({ page }) => {
    await page.goto("/dashboard");

    // Find and click problems link in navigation
    const problemsLink = page
      .locator(
        'a[href="/problems"], nav a:has-text("題目"), nav a:has-text("Problem")'
      )
      .first();
    await problemsLink.click();

    // Should navigate to problems page
    await expect(page).toHaveURL(/\/problems/);
  });

  test("should display problems in a table format", async ({ page }) => {
    await page.goto("/problems");
    await page.waitForLoadState("networkidle");

    // Wait for content to load
    await page.waitForTimeout(2000);

    // Check if problems are displayed in table or list
    const tableOrList = page.locator(
      'table, [role="table"], .problem-list, .cds--data-table'
    );

    await expect(tableOrList.first()).toBeVisible({ timeout: 10000 });
  });

  test("should show problem details with time and memory limits", async ({
    page,
  }) => {
    await page.goto("/problems");
    await page.waitForLoadState("networkidle");

    // Click on A+B Problem
    const aPlusBProblem = page
      .locator("text=" + TEST_PROBLEMS.aPlusB.title)
      .first();
    await expect(aPlusBProblem).toBeVisible({ timeout: 15000 });
    await aPlusBProblem.click();

    // Wait for navigation
    await page.waitForURL(/\/problems\/[^/]+/, { timeout: 10000 });

    // Should see time limit and memory limit
    await expect(
      page.locator("text=/Time Limit|時間限制/i").first()
    ).toBeVisible({ timeout: 10000 });

    await expect(
      page.locator("text=/Memory Limit|記憶體限制/i").first()
    ).toBeVisible({ timeout: 10000 });
  });
});
