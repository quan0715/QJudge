/**
 * E2E Tests for Problem List
 *
 * Tests problem list display, pagination, filtering, and navigation to problem details.
 */

import { test, expect } from "@playwright/test";
import { login } from "../helpers/auth.helper";
import { TEST_PROBLEMS } from "../helpers/data.helper";

test.describe("Problem List E2E Tests", () => {
  test.beforeEach(async ({ page }) => {
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

  test("should display test problems in the list", async ({ page }) => {
    await page.goto("/problems");

    // Wait for problems to load
    await page.waitForLoadState("networkidle");

    // Should see A+B Problem
    await expect(
      page.locator("text=" + TEST_PROBLEMS.aPlusB.title)
    ).toBeVisible({ timeout: 10000 });

    // Should see Hello World
    await expect(
      page.locator("text=" + TEST_PROBLEMS.helloWorld.title)
    ).toBeVisible();

    // Should see Factorial
    await expect(
      page.locator("text=" + TEST_PROBLEMS.factorial.title)
    ).toBeVisible();
  });

  test("should display problem metadata", async ({ page }) => {
    await page.goto("/problems");
    await page.waitForLoadState("networkidle");

    // Check if difficulty is displayed
    const difficultyElements = page.locator(
      "text=/easy|簡單|medium|中等|hard|困難/i"
    );
    await expect(difficultyElements.first()).toBeVisible({ timeout: 10000 });

    // Check if display IDs are shown (P001, P002, P003)
    const displayIds = page.locator("text=/P001|P002|P003/");
    const count = await displayIds.count();
    expect(count).toBeGreaterThan(0);
  });

  test("should navigate to problem detail when clicking on a problem", async ({
    page,
  }) => {
    await page.goto("/problems");
    await page.waitForLoadState("networkidle");

    // Click on A+B Problem
    const aPlusBProblem = page
      .locator("text=" + TEST_PROBLEMS.aPlusB.title)
      .first();
    await aPlusBProblem.click();

    // Should navigate to problem detail page
    await page.waitForURL(/\/problems\/\d+/, { timeout: 10000 });

    // Should see problem title on detail page
    await expect(
      page.locator("h1, h2").filter({ hasText: TEST_PROBLEMS.aPlusB.title })
    ).toBeVisible({ timeout: 10000 });
  });

  test("should handle pagination if available", async ({ page }) => {
    await page.goto("/problems");
    await page.waitForLoadState("networkidle");

    // Check if pagination exists
    const pagination = page
      .locator('.cds--pagination, [role="navigation"]')
      .filter({ hasText: /頁|page/i });

    if ((await pagination.count()) > 0) {
      // Check items per page selector
      const itemsPerPage = page.locator("select, .cds--select").first();
      if ((await itemsPerPage.count()) > 0) {
        // Change items per page
        await itemsPerPage.selectOption("20");
        await page.waitForTimeout(1000);

        // Verify URL or content updated
        // (specific checks depend on implementation)
      }
    }
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

  test("should show correct problem count", async ({ page }) => {
    await page.goto("/problems");
    await page.waitForLoadState("networkidle");

    // Wait for table or list to load
    await page.waitForTimeout(2000);

    // Count visible problem rows
    const problemRows = page.locator('[role="row"], .problem-row, tr').filter({
      has: page.locator("text=/A\\+B|Hello World|Factorial/"),
    });

    const count = await problemRows.count();

    // Should have at least 3 test problems
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test("should display problem difficulty badges", async ({ page }) => {
    await page.goto("/problems");
    await page.waitForLoadState("networkidle");

    // Look for difficulty indicators
    const easyBadges = page.locator("text=/easy|簡單/i");
    const mediumBadges = page.locator("text=/medium|中等/i");

    // Should have at least one easy and one medium problem
    expect(await easyBadges.count()).toBeGreaterThan(0);
    expect(await mediumBadges.count()).toBeGreaterThan(0);
  });

  test("should be able to search/filter problems if available", async ({
    page,
  }) => {
    await page.goto("/problems");
    await page.waitForLoadState("networkidle");

    // Check if search input exists
    const searchInput = page
      .locator(
        'input[type="search"], input[placeholder*="搜尋"], input[placeholder*="search"]'
      )
      .first();

    if ((await searchInput.count()) > 0) {
      // Type in search
      await searchInput.fill("A+B");
      await page.waitForTimeout(1000);

      // Should show A+B Problem
      await expect(
        page.locator("text=" + TEST_PROBLEMS.aPlusB.title)
      ).toBeVisible();

      // Should not show Factorial (unless it matches)
      // Note: This depends on actual search implementation
    }
  });

  test("should display problems in a table or list format", async ({
    page,
  }) => {
    await page.goto("/problems");
    await page.waitForLoadState("networkidle");

    // Check if problems are displayed in table or list
    const tableOrList = page.locator(
      'table, [role="table"], .problem-list, .data-table'
    );

    await expect(tableOrList.first()).toBeVisible({ timeout: 10000 });
  });
});
