/**
 * Classroom Join via Pending Actions — E2E spec
 *
 * Covers the full "unauthenticated classroom join" flow:
 *  1. Unauth visit to /magic-links/CODE saves code in sessionStorage then redirects to /login
 *  2. After login, pending action resolves and user is redirected back to /magic-links/CODE
 *     and then auto-joined → lands on /classrooms/[uuid]
 *  3. Pending action banner is visible on login page when magic link token is stored
 *
 * Depends on seed: teacher account.
 */

import { expect, test } from "@playwright/test";
import { clearAuth, loginViaAPI } from "../helpers/auth.helper";
import {
  fillAndSubmitLoginForm,
  getSessionStorageItem,
} from "../helpers/pending-actions.helper";

const MAGIC_LINK_TOKEN_KEY = "qjudge.magic_link_token";

test.describe("Classroom join via pending actions", () => {
  let inviteCode: string;

  test.beforeAll(async ({ browser }, testInfo) => {
    const baseURL =
      testInfo.project.use.baseURL ||
      process.env.PLAYWRIGHT_BASE_URL ||
      process.env.E2E_BASE_URL ||
      "http://localhost:5174";

    const ctx = await browser.newContext({ baseURL });
    const page = await ctx.newPage();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await loginViaAPI(page, "teacher");

    const token = await page.evaluate(() => localStorage.getItem("token"));
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    const name = `E2E Join Test ${Date.now()}`;
    const resp = await page.request.post("/api/v1/classrooms/", {
      headers,
      data: { name },
    });
    expect(resp.ok()).toBeTruthy();

    const body = await resp.json();
    const classroom = body?.data ?? body;
    inviteCode = String(classroom.invite_code ?? classroom.inviteCode);

    await page.close();
    await ctx.close();
  });

  // ── Case 1 ──────────────────────────────────────────────────────────────────
  test("unauth visit to /magic-links/CODE → login → auto-join", async ({
    page,
  }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await clearAuth(page);

    // Visit the join URL without being authenticated
    await page.goto(`/magic-links/${inviteCode}`, {
      waitUntil: "domcontentloaded",
    });

    // Should redirect to /login
    await page.waitForURL(/\/login/, { timeout: 15000 });
    expect(page.url()).toContain("/login");

    // Verify sessionStorage has the magic link token
    const storedToken = await getSessionStorageItem(page, MAGIC_LINK_TOKEN_KEY);
    expect(storedToken).toBe(inviteCode);

    // Fill and submit the login form
    await fillAndSubmitLoginForm(page, "student2");

    // Should redirect back to /magic-links/CODE first
    await page.waitForURL(
      new RegExp(`/magic-links/${inviteCode}`),
      { timeout: 20000 },
    );

    // Then auto-join completes and redirects to /classrooms/[uuid]
    await page.waitForURL(/\/classrooms\/[a-f0-9-]+(?:\/|$)/, {
      timeout: 20000,
    });

    const finalURL = page.url();
    expect(finalURL).not.toContain("/login");
    expect(finalURL).not.toContain("/magic-links/");
  });

  // ── Case 2 ──────────────────────────────────────────────────────────────────
  test("pending action banner shows on login page", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await clearAuth(page);

    // Visit the join URL without being authenticated
    await page.goto(`/magic-links/${inviteCode}`, {
      waitUntil: "domcontentloaded",
    });

    // Should redirect to /login
    await page.waitForURL(/\/login/, { timeout: 15000 });

    // PendingActionBanner should be visible
    await expect(page.locator(".cds--inline-notification")).toBeVisible({
      timeout: 10000,
    });
  });
});
