/**
 * Exam Takeover via Pending Actions — E2E spec
 *
 * Covers the full "device B takeover" flow:
 *  1. Login from a different device shows takeover screen → redirects to contest dashboard
 *  2. Old device token is invalidated after takeover
 *  3. Same device login does NOT trigger takeover
 *  4. Student with no active exam goes to /dashboard, NOT /exam-takeover
 *
 * Depends on seed: E2E Exam Mode Contest, teacher / student / student2 accounts.
 */

import { expect, test } from "@playwright/test";
import { loginViaAPI, clearAuth } from "../helpers/auth.helper";
import { API_ENDPOINTS, TEST_USERS } from "../helpers/data.helper";
import {
  prepareExamTakeoverScenario,
  fillAndSubmitLoginForm,
  getSessionStorageItem,
  type TakeoverScenario,
} from "../helpers/pending-actions.helper";

const DEVICE_KEY = "qjudge.device_id.v1";
const TAKEOVER_TOKEN_KEY = "qjudge.exam_takeover_token";

test.describe("Exam takeover via pending actions", () => {
  let scenario: TakeoverScenario;

  test.beforeAll(async ({ browser }, testInfo) => {
    const baseURL =
      testInfo.project.use.baseURL ||
      process.env.PLAYWRIGHT_BASE_URL ||
      process.env.E2E_BASE_URL ||
      "http://localhost:5174";

    scenario = await prepareExamTakeoverScenario(browser, baseURL);
  });

  test.afterAll(async () => {
    await scenario?.cleanup();
  });

  // ── Case 1 ──────────────────────────────────────────────────────────────────
  test("login from different device shows takeover screen and redirects to contest dashboard", async ({
    browser,
  }, testInfo) => {
    const baseURL =
      testInfo.project.use.baseURL ||
      process.env.PLAYWRIGHT_BASE_URL ||
      process.env.E2E_BASE_URL ||
      "http://localhost:5174";

    const deviceB = `e2e-takeover-b-${Date.now()}`;
    const ctxB = await browser.newContext({ baseURL });
    try {
      const page = await ctxB.newPage();

      // Set a different device ID so the backend sees a new device
      await page.goto("/login", { waitUntil: "domcontentloaded" });
      await page.evaluate(
        ([k, v]) => localStorage.setItem(k, v),
        [DEVICE_KEY, deviceB] as [string, string],
      );

      // Fill and submit the login form; do NOT await navigation here
      await fillAndSubmitLoginForm(page, "student");

      // Should land on the takeover screen
      await page.waitForURL(/\/exam-takeover/, { timeout: 20000 });
      expect(page.url()).toContain("/exam-takeover");

      // Conflict token must be stored in sessionStorage
      const token = await getSessionStorageItem(page, TAKEOVER_TOKEN_KEY);
      expect(token).toBeTruthy();

      // Takeover button must be visible
      const takeoverBtn = page.getByTestId("auth-exam-takeover-btn");
      await expect(takeoverBtn).toBeVisible({ timeout: 10000 });

      // Click the takeover button
      await takeoverBtn.click();

      // Step progress text (Chinese "清除" / "清空" or English "Clearing") should appear
      await expect(
        page.locator("text=/清除|清空|Clearing/"),
      ).toBeVisible({ timeout: 10000 });

      // Wait for redirect to the contest dashboard (not /dashboard)
      await page.waitForURL(
        new RegExp(`/classrooms/[^/]+/contest/${scenario.contestId}`),
        { timeout: 30000 },
      );

      const finalURL = page.url();
      expect(finalURL).toContain(`/contest/${scenario.contestId}`);
      expect(finalURL).not.toMatch(/\/dashboard$/);
    } finally {
      await ctxB.close();
    }
  });

  // ── Case 2 ──────────────────────────────────────────────────────────────────
  test("old device token is invalidated after takeover", async ({ browser }, testInfo) => {
    const baseURL =
      testInfo.project.use.baseURL ||
      process.env.PLAYWRIGHT_BASE_URL ||
      process.env.E2E_BASE_URL ||
      "http://localhost:5174";

    // Device A — log in and grab the token
    const deviceA = `e2e-takeover-oldA-${Date.now()}`;
    const ctxA = await browser.newContext({
      baseURL,
      extraHTTPHeaders: { "X-Device-Id": deviceA },
    });

    // Device B — will perform the takeover
    const deviceB = `e2e-takeover-oldB-${Date.now()}`;
    const ctxB = await browser.newContext({
      baseURL,
      extraHTTPHeaders: { "X-Device-Id": deviceB },
    });

    try {
      // ── Prepare: device A logs in and starts the exam ──────────────────────
      const pageA = await ctxA.newPage();
      await pageA.goto("/", { waitUntil: "domcontentloaded" });
      await pageA.evaluate(
        ([k, v]) => localStorage.setItem(k, v),
        [DEVICE_KEY, deviceA] as [string, string],
      );
      await loginViaAPI(pageA, "student");

      const oldToken = await pageA.evaluate(() => localStorage.getItem("token"));
      expect(oldToken).toBeTruthy();

      // ── Device B: call login API to get 403 + conflict_token ───────────────
      const pageB = await ctxB.newPage();
      await pageB.goto("/", { waitUntil: "domcontentloaded" });

      const loginResp = await pageB.request.post(API_ENDPOINTS.auth.login, {
        data: {
          email: TEST_USERS.student.email,
          password: TEST_USERS.student.password,
        },
      });
      // Accept both 403 (EXAM_TAKEOVER_REQUIRED) and 409 (EXAM_CONFLICT_ACTIVE_SESSION)
      expect([403, 409]).toContain(loginResp.status());
      const loginBody = (await loginResp.json()) as {
        conflict_token?: string;
        code?: string;
      };
      const conflictToken = loginBody.conflict_token;
      expect(conflictToken).toBeTruthy();

      // ── Device B: call resolve-conflict to complete the takeover ───────────
      const resolveResp = await pageB.request.post(
        API_ENDPOINTS.auth.resolveConflict,
        {
          data: {
            conflict_token: conflictToken,
            action: "takeover_recovery",
          },
        },
      );
      expect(resolveResp.ok()).toBeTruthy();

      // ── Verify: device A's old token is now rejected ───────────────────────
      const meResp = await pageA.request.get(API_ENDPOINTS.auth.me, {
        headers: { Authorization: `Bearer ${oldToken}` },
      });
      expect([401, 403]).toContain(meResp.status());
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  // ── Case 3 ──────────────────────────────────────────────────────────────────
  test("same device login does not trigger takeover", async ({ browser }, testInfo) => {
    const baseURL =
      testInfo.project.use.baseURL ||
      process.env.PLAYWRIGHT_BASE_URL ||
      process.env.E2E_BASE_URL ||
      "http://localhost:5174";

    // Use the same device ID that started the exam in the scenario
    const ctx = await browser.newContext({
      baseURL,
      extraHTTPHeaders: { "X-Device-Id": scenario.deviceA },
    });
    try {
      const page = await ctx.newPage();
      await page.goto("/", { waitUntil: "domcontentloaded" });

      const loginResp = await page.request.post(API_ENDPOINTS.auth.login, {
        data: {
          email: TEST_USERS.student.email,
          password: TEST_USERS.student.password,
        },
      });

      expect(loginResp.status()).toBe(200);
      const body = (await loginResp.json()) as { success?: boolean };
      expect(body.success).toBe(true);
    } finally {
      await ctx.close();
    }
  });

  // ── Case 4 ──────────────────────────────────────────────────────────────────
  test("no active exam does not trigger takeover", async ({ page }) => {
    await clearAuth(page);
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    // student2 has no active exam
    await fillAndSubmitLoginForm(page, "student2");

    // Should redirect to /dashboard or /onboarding, NOT /exam-takeover
    await page.waitForURL(/\/(dashboard|onboarding|classrooms|problems)/, {
      timeout: 20000,
    });

    const finalURL = page.url();
    expect(finalURL).not.toContain("/exam-takeover");
  });
});
