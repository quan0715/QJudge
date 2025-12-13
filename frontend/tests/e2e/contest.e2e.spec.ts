/**
 * E2E Tests for Contest Features
 *
 * Tests contest list, joining contests, solving problems in contests,
 * viewing leaderboard, and contest time restrictions.
 */

import { test, expect } from "@playwright/test";
import { login, clearAuth } from "../helpers/auth.helper";
import { TEST_CONTESTS } from "../helpers/data.helper";

test.describe("Contest E2E Tests", () => {
  // Use serial mode to avoid login conflicts
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    // Clear any previous auth state
    await page.goto("/login");
    await clearAuth(page);
    // Login as student before each test
    await login(page, "student");
  });

  test("should display contest list page", async ({ page }) => {
    // Navigate to contests page
    await page.goto("/contests");

    // Should see contest list page
    await expect(page).toHaveURL(/\/contests/);

    // Should see page header
    await expect(
      page
        .locator("h1, h2, .page-header")
        .filter({ hasText: /競賽|Contest|比賽/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test("should display test contests in the list", async ({ page }) => {
    await page.goto("/contests");
    await page.waitForLoadState("networkidle");

    // Should see E2E Test Contest
    await expect(page.locator("text=" + TEST_CONTESTS.active.name)).toBeVisible(
      { timeout: 10000 }
    );

    // May also see Upcoming Contest
    // (visibility depends on contest status logic)
  });

  test("should show contest status (active/upcoming/ended)", async ({
    page,
  }) => {
    await page.goto("/contests");
    await page.waitForLoadState("networkidle");

    // Look for status indicators
    const statusElements = page.locator(
      "text=/進行中|即將開始|已結束|Active|Upcoming|Ended/i"
    );

    // Should have at least one status indicator
    expect(await statusElements.count()).toBeGreaterThan(0);
  });

  test("should navigate to contest detail page", async ({ page }) => {
    await page.goto("/contests");
    await page.waitForLoadState("networkidle");

    // Click on E2E Test Contest
    const contestLink = page
      .locator("text=" + TEST_CONTESTS.active.name)
      .first();
    await contestLink.click();

    // Should navigate to contest detail page
    await page.waitForURL(/\/contests\/\d+/, { timeout: 10000 });

    // Should see contest name
    await expect(
      page.locator("h1, h2").filter({ hasText: TEST_CONTESTS.active.name })
    ).toBeVisible({ timeout: 10000 });
  });

  test("should display contest information", async ({ page }) => {
    await page.goto("/contests");
    await page.waitForLoadState("networkidle");

    const contestLink = page
      .locator("text=" + TEST_CONTESTS.active.name)
      .first();
    await contestLink.click();
    await page.waitForURL(/\/contests\/\d+/);

    // Should see contest description
    await expect(page.locator("text=/描述|Description|說明/i")).toBeVisible({
      timeout: 10000,
    });

    // Should see time information
    await expect(
      page.locator("text=/時間|Time|開始|Start|結束|End/i")
    ).toBeVisible({ timeout: 10000 });
  });

  test("should join an active contest", async ({ page }) => {
    await page.goto("/contests");
    await page.waitForLoadState("networkidle");

    // Navigate to E2E Test Contest
    const contestLink = page
      .locator("text=" + TEST_CONTESTS.active.name)
      .first();
    await contestLink.click();
    await page.waitForURL(/\/contests\/\d+/);

    // Look for join button
    const joinButton = page
      .locator(
        'button:has-text("加入"), button:has-text("Join"), button:has-text("參加")'
      )
      .first();

    if (await joinButton.isVisible({ timeout: 5000 })) {
      await joinButton.click();

      // Wait for join action to complete
      await page.waitForTimeout(2000);

      // Should see problems list or confirmation
      // Button might change to "已加入" or disappear
      const alreadyJoined = page.locator("text=/已加入|Joined|離開|Leave/i");
      await expect(alreadyJoined.first()).toBeVisible({ timeout: 5000 });
    } else {
      // Already joined, verify we can see contest content
      await expect(
        page.locator("text=/題目|Problem|排行|Leaderboard/i")
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test("should display contest problems", async ({ page }) => {
    await page.goto("/contests");
    await page.waitForLoadState("networkidle");

    const contestLink = page
      .locator("text=" + TEST_CONTESTS.active.name)
      .first();
    await contestLink.click();
    await page.waitForURL(/\/contests\/\d+/);

    // Try to join if needed
    const joinButton = page
      .locator('button:has-text("加入"), button:has-text("Join")')
      .first();
    if (await joinButton.isVisible({ timeout: 3000 })) {
      await joinButton.click();
      await page.waitForTimeout(2000);
    }

    // Navigate to problems tab
    const problemsTab = page
      .locator(
        'button:has-text("題目"), button:has-text("Problems"), a:has-text("題目"), a:has-text("Problems")'
      )
      .first();

    if ((await problemsTab.count()) > 0) {
      await problemsTab.click();
      await page.waitForTimeout(1000);
    }

    // Should see contest problems (A+B and Hello World)
    await expect(page.locator("text=/A+B|Hello World/i").first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("should access problem from contest", async ({ page }) => {
    await page.goto("/contests");
    await page.waitForLoadState("networkidle");

    const contestLink = page
      .locator("text=" + TEST_CONTESTS.active.name)
      .first();
    await contestLink.click();
    await page.waitForURL(/\/contests\/\d+/);

    // Join if needed
    const joinButton = page
      .locator('button:has-text("加入"), button:has-text("Join")')
      .first();
    if (await joinButton.isVisible({ timeout: 3000 })) {
      await joinButton.click();
      await page.waitForTimeout(2000);
    }

    // Click on a problem
    const problemLink = page.locator("text=/A+B Problem/i").first();

    if ((await problemLink.count()) > 0) {
      await problemLink.click();

      // Should navigate to contest problem page
      await page.waitForTimeout(2000);

      // URL might be /contests/:id/problems/:id
      const url = page.url();
      expect(url).toMatch(/\/contests\/\d+/);
    }
  });

  test("should display contest leaderboard", async ({ page }) => {
    await page.goto("/contests");
    await page.waitForLoadState("networkidle");

    const contestLink = page
      .locator("text=" + TEST_CONTESTS.active.name)
      .first();
    await contestLink.click();
    await page.waitForURL(/\/contests\/\d+/);

    // Join if needed
    const joinButton = page
      .locator('button:has-text("加入"), button:has-text("Join")')
      .first();
    if (await joinButton.isVisible({ timeout: 3000 })) {
      await joinButton.click();
      await page.waitForTimeout(2000);
    }

    // Navigate to leaderboard/ranking tab
    const leaderboardTab = page
      .locator(
        'button:has-text("排行"), button:has-text("Leaderboard"), button:has-text("Ranking"), a:has-text("排行")'
      )
      .first();

    if ((await leaderboardTab.count()) > 0) {
      await leaderboardTab.click();
      await page.waitForTimeout(2000);

      // Should see ranking table or list
      await expect(
        page.locator("text=/排名|Rank|分數|Score/i").first()
      ).toBeVisible({ timeout: 10000 });
    }
  });

  test("should show own ranking in leaderboard", async ({ page }) => {
    await page.goto("/contests");
    await page.waitForLoadState("networkidle");

    const contestLink = page
      .locator("text=" + TEST_CONTESTS.active.name)
      .first();
    await contestLink.click();
    await page.waitForURL(/\/contests\/\d+/);

    // Join if needed
    const joinButton = page
      .locator('button:has-text("加入"), button:has-text("Join")')
      .first();
    if (await joinButton.isVisible({ timeout: 3000 })) {
      await joinButton.click();
      await page.waitForTimeout(2000);
    }

    // Navigate to leaderboard
    const leaderboardTab = page
      .locator('button:has-text("排行"), a:has-text("排行")')
      .first();
    if ((await leaderboardTab.count()) > 0) {
      await leaderboardTab.click();
      await page.waitForTimeout(2000);

      // Should see student's name or indicator
      await expect(page.locator("text=/student|你|You/i").first()).toBeVisible({
        timeout: 10000,
      });
    }
  });

  test("should prevent joining upcoming contest", async ({ page }) => {
    await page.goto("/contests");
    await page.waitForLoadState("networkidle");

    // Try to find Upcoming Contest
    const upcomingContest = page.locator("text=" + TEST_CONTESTS.upcoming.name);

    if ((await upcomingContest.count()) > 0) {
      await upcomingContest.first().click();
      await page.waitForURL(/\/contests\/\d+/);

      // Should not have a join button, or it should be disabled
      const joinButton = page
        .locator('button:has-text("加入"), button:has-text("Join")')
        .first();

      if ((await joinButton.count()) > 0) {
        // Button should be disabled
        expect(await joinButton.isDisabled()).toBe(true);
      }

      // Should see message about contest not started
      await expect(
        page.locator("text=/尚未開始|Not started|即將開始/i").first()
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test("should display contest time restrictions", async ({ page }) => {
    await page.goto("/contests");
    await page.waitForLoadState("networkidle");

    const contestLink = page
      .locator("text=" + TEST_CONTESTS.active.name)
      .first();
    await contestLink.click();
    await page.waitForURL(/\/contests\/\d+/);

    // Should see time information
    const timeInfo = page.locator(
      "text=/開始時間|Start Time|結束時間|End Time|剩餘時間|Remaining/i"
    );

    expect(await timeInfo.count()).toBeGreaterThan(0);
  });

  test("should access contests from navigation menu", async ({ page }) => {
    await page.goto("/dashboard");

    // Find and click contests link in navigation
    const contestsLink = page
      .locator(
        'a[href="/contests"], nav a:has-text("競賽"), nav a:has-text("Contest")'
      )
      .first();

    if ((await contestsLink.count()) > 0) {
      await contestsLink.click();

      // Should navigate to contests page
      await expect(page).toHaveURL(/\/contests/);
    }
  });
});
