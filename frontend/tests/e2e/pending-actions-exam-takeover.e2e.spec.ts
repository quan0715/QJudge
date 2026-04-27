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
import { authHeaders, prepareStudentPaperExamInProgress } from "../helpers/exam-lifecycle.helper";
import {
  prepareExamTakeoverScenario,
  resetStudentParticipant,
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

    // Re-prepare: reset participant and restart exam so we have a clean active session
    await resetStudentParticipant(scenario.teacherPage, scenario.contestId);

    const deviceA = `e2e-invalidate-a-${Date.now()}`;
    const deviceB = `e2e-invalidate-b-${Date.now()}`;

    const ctxA = await browser.newContext({
      baseURL,
      extraHTTPHeaders: { "X-Device-Id": deviceA },
    });
    const ctxB = await browser.newContext({
      baseURL,
      extraHTTPHeaders: { "X-Device-Id": deviceB },
    });

    try {
      // Device A: login and start exam
      const pageA = await ctxA.newPage();
      await pageA.goto("/", { waitUntil: "domcontentloaded" });
      await pageA.evaluate(
        ([k, v]) => localStorage.setItem(k, v),
        [DEVICE_KEY, deviceA] as [string, string],
      );
      await loginViaAPI(pageA, "student");
      await prepareStudentPaperExamInProgress(pageA, scenario.teacherPage, scenario.contestId);

      const oldToken = await pageA.evaluate(() => localStorage.getItem("token"));
      expect(oldToken).toBeTruthy();

      // Device B: login → 403 conflict → resolve takeover
      const pageB = await ctxB.newPage();
      const loginRespB = await pageB.request.post(API_ENDPOINTS.auth.login, {
        data: {
          email: TEST_USERS.student.email,
          password: TEST_USERS.student.password,
        },
      });
      expect([403, 409]).toContain(loginRespB.status());
      const bodyB = (await loginRespB.json()) as { conflict_token?: string };
      expect(bodyB.conflict_token).toBeTruthy();

      const resolveResp = await pageB.request.post(
        API_ENDPOINTS.auth.resolveConflict,
        {
          data: {
            conflict_token: bodyB.conflict_token,
            action: "takeover_recovery",
          },
        },
      );
      expect(resolveResp.ok()).toBeTruthy();

      // Verify: device A's old token is now rejected
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

    // Re-prepare a clean exam session with a known device
    await resetStudentParticipant(scenario.teacherPage, scenario.contestId);
    const sameDevice = `e2e-same-device-${Date.now()}`;
    const setupCtx = await browser.newContext({
      baseURL,
      extraHTTPHeaders: { "X-Device-Id": sameDevice },
    });
    const setupPage = await setupCtx.newPage();
    await setupPage.goto("/", { waitUntil: "domcontentloaded" });
    await setupPage.evaluate(
      ([k, v]) => localStorage.setItem(k, v),
      [DEVICE_KEY, sameDevice] as [string, string],
    );
    await loginViaAPI(setupPage, "student");
    await prepareStudentPaperExamInProgress(setupPage, scenario.teacherPage, scenario.contestId);
    await setupPage.close();
    await setupCtx.close();

    // Now login from the SAME device — should succeed without conflict
    const ctx = await browser.newContext({
      baseURL,
      extraHTTPHeaders: { "X-Device-Id": sameDevice },
    });
    try {
      const page = await ctx.newPage();
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
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await clearAuth(page);

    // student2 has no active exam
    await fillAndSubmitLoginForm(page, "student2");

    // Should redirect to /dashboard or /onboarding, NOT /exam-takeover
    await page.waitForURL(/\/(dashboard|onboarding|classrooms|problems)/, {
      timeout: 20000,
    });

    const finalURL = page.url();
    expect(finalURL).not.toContain("/exam-takeover");
  });

  // ── Case 5 ──────────────────────────────────────────────────────────────────
  test("stale takeover token falls back when exam already finished", async ({
    browser,
  }, testInfo) => {
    const baseURL =
      testInfo.project.use.baseURL ||
      process.env.PLAYWRIGHT_BASE_URL ||
      process.env.E2E_BASE_URL ||
      "http://localhost:5174";

    await resetStudentParticipant(scenario.teacherPage, scenario.contestId);
    const deviceA = `e2e-takeover-a-end-${Date.now()}`;
    const deviceB = `e2e-takeover-b-end-${Date.now()}`;

    const ctxA = await browser.newContext({
      baseURL,
      extraHTTPHeaders: { "X-Device-Id": deviceA },
    });
    const ctxB = await browser.newContext({
      baseURL,
      extraHTTPHeaders: { "X-Device-Id": deviceB },
    });

    try {
      const pageA = await ctxA.newPage();
      await pageA.goto("/", { waitUntil: "domcontentloaded" });
      await pageA.evaluate(
        ([k, v]) => localStorage.setItem(k, v),
        [DEVICE_KEY, deviceA] as [string, string],
      );
      await loginViaAPI(pageA, "student");
      await prepareStudentPaperExamInProgress(pageA, scenario.teacherPage, scenario.contestId);

      const endHeaders = await authHeaders(pageA);
      const endResp = await pageA.request.post(
        API_ENDPOINTS.contests.examEnd(scenario.contestId),
        {
          headers: endHeaders,
          data: { submit_reason: "e2e-takeover-stale" },
        },
      );
      expect(endResp.ok()).toBeTruthy();

      const pageB = await ctxB.newPage();
      const blockResp = await pageB.request.post(API_ENDPOINTS.auth.login, {
        data: {
          email: TEST_USERS.student.email,
          password: TEST_USERS.student.password,
        },
      });
      expect([403, 409]).toContain(blockResp.status());
      const blockBody = (await blockResp.json()) as {
        conflict_token?: string;
      };
      expect(blockBody.conflict_token).toBeTruthy();

      await pageB.goto("/", { waitUntil: "domcontentloaded" });
      await pageB.evaluate(
        ([k, v]) => sessionStorage.setItem(k, v),
        [TAKEOVER_TOKEN_KEY, blockBody.conflict_token!] as [string, string],
      );
      await pageB.goto("/exam-takeover", { waitUntil: "domcontentloaded" });

      const takeoverBtn = pageB.getByTestId("auth-exam-takeover-btn");
      await expect(takeoverBtn).toBeVisible({ timeout: 10000 });
      await takeoverBtn.click();

      await pageB.waitForURL(/\/(dashboard|onboarding|classrooms|problems|login)/, {
        timeout: 20000,
      });
      expect(pageB.url()).not.toContain("/exam-takeover");
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
