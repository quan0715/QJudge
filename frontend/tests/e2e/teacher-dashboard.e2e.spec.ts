/**
 * E2E Tests for Teacher Dashboard
 *
 * Tests teacher dashboard access and chatbot widget presence.
 */

import { test, expect, type Page } from "@playwright/test";
import { login, loginViaAPI, clearAuth } from "../helpers/auth.helper";

type UserRole = "admin" | "teacher" | "student" | "student2";

/**
 * Navigate to /teacher with auth.
 * Uses loginViaAPI first; falls back to UI login for WebKit.
 */
async function loginAndGotoTeacher(page: Page, role: UserRole) {
  // Attempt 1: loginViaAPI (fast path)
  await loginViaAPI(page, role);
  await page.goto("/teacher");
  await page.waitForURL(/\/teacher|\/login/, { timeout: 10000 });

  // Give time for SPA auth check
  const heading = page.locator("h1").filter({ hasText: /教師後台|Teacher/i });
  const ok = await heading.isVisible({ timeout: 5000 }).catch(() => false);
  if (ok) return;

  // Attempt 2: full UI login flow
  await page.goto("/");
  await clearAuth(page);
  await login(page, role);
  await page.goto("/teacher");
  await page.waitForURL(/\/teacher|\/login/, { timeout: 10000 });
}

test.describe("Teacher Dashboard E2E Tests", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clearAuth(page);
  });

  test("should display chatbot widget for teacher", async ({ page }) => {
    await loginAndGotoTeacher(page, "teacher");

    // Should see teacher dashboard title
    await expect(
      page.locator("h1").filter({ hasText: /教師後台|Teacher/i })
    ).toBeVisible({ timeout: 15000 });

    // Should see chatbot widget button ("展開 Qgent TA")
    const chatbotButton = page.getByRole("button", {
      name: /Qgent|chatbot|chat|展開/i,
    });
    await expect(chatbotButton.first()).toBeVisible({ timeout: 10000 });
  });

  test("should display chatbot widget for admin", async ({ page }) => {
    await loginAndGotoTeacher(page, "admin");

    await expect(
      page.locator("h1").filter({ hasText: /教師後台|Teacher/i })
    ).toBeVisible({ timeout: 15000 });

    const chatbotButton = page.getByRole("button", {
      name: /Qgent|chatbot|chat|展開/i,
    });
    await expect(chatbotButton.first()).toBeVisible({ timeout: 10000 });
  });

  test("should show problem management and contest management tabs", async ({
    page,
  }) => {
    await loginAndGotoTeacher(page, "teacher");

    await expect(
      page.getByRole("tab", { name: /題目管理|Problem/i })
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByRole("tab", { name: /競賽管理|Contest/i })
    ).toBeVisible({ timeout: 10000 });
  });
});
