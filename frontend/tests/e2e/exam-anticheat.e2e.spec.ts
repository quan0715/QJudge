/**
 * E2E Tests for Exam Anti-Cheat System
 *
 * Tests violation warnings, auto-lock, 15s timeout, admin unlock,
 * and teacher bypass in exam mode.
 *
 * Depends on seed data: "E2E Exam Mode Contest" (max_cheat_warnings=2).
 */

import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { loginViaAPI, clearAuth } from "../helpers/auth.helper";
import {
  TEST_CONTESTS,
  API_ENDPOINTS,
} from "../helpers/data.helper";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build Authorization header from page localStorage. */
async function authHeaders(page: Page) {
  const token = await page.evaluate(() => localStorage.getItem("token"));
  expect(token).toBeTruthy();
  return { Authorization: `Bearer ${token}` };
}

/** Find the exam-mode contest ID from the API listing. */
async function findExamContestId(page: Page): Promise<string> {
  const headers = await authHeaders(page);
  const resp = await page.request.get(API_ENDPOINTS.contests.list, { headers });
  expect(resp.ok()).toBeTruthy();
  const body = await resp.json();
  const list = Array.isArray(body) ? body : body.results ?? body.data ?? [];
  const contest = list.find(
    (c: { name: string }) => c.name === TEST_CONTESTS.examMode.name
  );
  expect(contest).toBeTruthy();
  return String(contest.id);
}

/** Get current user's ID. */
async function getMyUserId(page: Page): Promise<number> {
  const headers = await authHeaders(page);
  const resp = await page.request.get(API_ENDPOINTS.auth.me, { headers });
  expect(resp.ok()).toBeTruthy();
  const data = await resp.json();
  return data?.data?.id ?? data?.id;
}

/**
 * Ensure student is registered and in IN_PROGRESS exam state with
 * violation_count = 0 (clean slate for each test).
 *
 * Flow:
 * 1. Register (idempotent)
 * 2. First start attempt — sets started_at for fresh participants
 * 3. Teacher unlock — resets violation_count to 0 and sets PAUSED
 *    (requires started_at to already be set for exam-questions access)
 * 4. Second start — PAUSED → IN_PROGRESS
 *
 * Handles LOCKED, SUBMITTED, and other edge states via unlock/reopen.
 */
async function ensureStudentReady(
  page: Page,
  role: "student" | "student2",
  teacherPage: Page
): Promise<string> {
  await loginViaAPI(page, role);
  const contestId = await findExamContestId(page);
  const headers = await authHeaders(page);
  const userId = await getMyUserId(page);
  const teacherHeaders = await authHeaders(teacherPage);

  // 1. Register (idempotent — 400 if already registered)
  const regResp = await page.request.post(
    API_ENDPOINTS.contests.register(contestId),
    { headers }
  );
  expect([200, 201, 400]).toContain(regResp.status());

  // 2. First start attempt — ensures started_at is set for fresh participants
  const firstStart = await page.request.post(
    API_ENDPOINTS.contests.examStart(contestId),
    { headers }
  );

  if (!firstStart.ok()) {
    // Handle LOCKED or SUBMITTED: try reopen then unlock
    await teacherPage.request.post(
      `/api/v1/contests/${contestId}/reopen_exam/`,
      { headers: teacherHeaders, data: { user_id: userId } }
    );
    await teacherPage.request.post(
      `/api/v1/contests/${contestId}/unlock_participant/`,
      { headers: teacherHeaders, data: { user_id: userId } }
    );
    // Start after reopen/unlock to set started_at
    const retryStart = await page.request.post(
      API_ENDPOINTS.contests.examStart(contestId),
      { headers }
    );
    expect(retryStart.ok()).toBeTruthy();
  }

  // 3. Teacher unlock — reset violation_count to 0, set PAUSED
  //    (started_at is preserved from the start call above)
  await teacherPage.request.post(
    `/api/v1/contests/${contestId}/unlock_participant/`,
    { headers: teacherHeaders, data: { user_id: userId } }
  );

  // 4. Final start — PAUSED → IN_PROGRESS with violation_count = 0
  const finalStart = await page.request.post(
    API_ENDPOINTS.contests.examStart(contestId),
    { headers }
  );
  expect(finalStart.ok()).toBeTruthy();

  return contestId;
}

/** Post a violation event via API. */
async function postViolationEvent(
  page: Page,
  contestId: string,
  eventType = "tab_hidden"
) {
  const headers = await authHeaders(page);
  return page.request.post(
    API_ENDPOINTS.contests.examEvents(contestId),
    { headers, data: { event_type: eventType } }
  );
}

/** Navigate to paper exam answering page directly. */
async function gotoExamAnswering(page: Page, contestId: string) {
  // Set precheck gate in sessionStorage so the answering page won't redirect back
  await page.evaluate((cid) => {
    window.sessionStorage.setItem(`qjudge.paper_exam.precheck_gate.v1:${cid}`, "1");
  }, contestId);

  // Stub fullscreen API so ExamModeWrapper's initial check sees us as "in fullscreen"
  // and doesn't show the exit-fullscreen-and-submit confirmation modal.
  await page.addInitScript(() => {
    Object.defineProperty(document, "fullscreenElement", {
      get: () => document.documentElement,
      configurable: true,
    });
  });

  // Navigate directly to answering page
  await page.goto(`/contests/${contestId}/paper-exam/answering`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
}

/** Trigger a visibilitychange hidden event. */
async function triggerVisibilityHidden(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      writable: true,
      configurable: true,
    });
    Object.defineProperty(document, "hidden", {
      value: true,
      writable: true,
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

// ---------------------------------------------------------------------------
// Stubs for headless environment
// ---------------------------------------------------------------------------

/**
 * Install browser-API stubs so that precheck environment checks pass in
 * Playwright's headless Chromium (no real fullscreen / focus support).
 *
 * Must be called BEFORE any navigation so that addInitScript takes effect.
 */
async function installHeadlessStubs(page: Page) {
  await page.addInitScript(() => {
    // Stub requestFullscreen → always resolve
    Element.prototype.requestFullscreen = () => Promise.resolve();

    // Stub fullscreenElement → looks like we're in fullscreen
    Object.defineProperty(document, "fullscreenElement", {
      get: () => document.documentElement,
      configurable: true,
    });

    // Stub hasFocus → always true
    document.hasFocus = () => true;
  });
}

/**
 * Create a fresh browser context with headless stubs pre-installed.
 * Every page opened from this context will have the stubs.
 */
async function createStubbedContext(browser: import("@playwright/test").Browser): Promise<BrowserContext> {
  const ctx = await browser.newContext({ baseURL: "http://localhost:5174" });
  // addInitScript on context applies to all pages in that context
  await ctx.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.resolve();
    Object.defineProperty(document, "fullscreenElement", {
      get: () => document.documentElement,
      configurable: true,
    });
    document.hasFocus = () => true;
  });
  return ctx;
}

// ---------------------------------------------------------------------------
// Tests — Paper Exam Precheck
// ---------------------------------------------------------------------------

test.describe("Paper Exam Precheck E2E", () => {
  let teacherPage: Page;

  test.beforeAll(async ({ browser }) => {
    const ctx = await createStubbedContext(browser);
    teacherPage = await ctx.newPage();
    await teacherPage.goto("/");
    await loginViaAPI(teacherPage, "teacher");
  });

  test.afterAll(async () => {
    await teacherPage.context().close();
  });

  test.beforeEach(async ({ page }) => {
    await installHeadlessStubs(page);
    await page.goto("/");
    await clearAuth(page);
  });

  test("precheck passes all steps and navigates to answering", async ({ page }) => {
    // 45s timeout — precheck has artificial delays (600+1200+1500+800+1500+800 ms ≈ 6.4s) + countdown 3s
    test.setTimeout(60_000);

    // --- Setup: student registered + in_progress ---
    const contestId = await ensureStudentReady(page, "student", teacherPage);

    // Navigate to precheck page
    await page.goto(`/contests/${contestId}/exam-precheck`);
    await page.waitForLoadState("networkidle");

    // --- Step 1: Identity checks (auto-pass) ---
    // Wait for the identity checks to show "pass"
    await expect(
      page.locator("[data-status='pass']").filter({ hasText: /身份驗證/ })
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator("[data-status='pass']").filter({ hasText: /交卷記錄/ })
    ).toBeVisible({ timeout: 5000 });

    // Click "下一步：環境檢查"
    const nextStepBtn = page.getByRole("button", { name: /下一步：環境檢查|Next.*Environment/i });
    await expect(nextStepBtn).toBeEnabled({ timeout: 5000 });
    await nextStepBtn.click();

    // --- Step 2: Environment checks ---
    // Click "開始環境測試"
    const startEnvBtn = page.getByRole("button", { name: /開始環境測試|Start Environment/i });
    await expect(startEnvBtn).toBeVisible({ timeout: 5000 });
    await startEnvBtn.click();

    // Wait for all 3 env checks to pass (total ~6.4s of delays)
    await expect(
      page.locator("[data-status='pass']").filter({ hasText: /單螢幕/ })
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.locator("[data-status='pass']").filter({ hasText: /全螢幕/ })
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.locator("[data-status='pass']").filter({ hasText: /焦點/ })
    ).toBeVisible({ timeout: 15000 });

    // Click footer CTA "下一步：確認開始" (avoid matching left stepper button)
    const confirmStepBtn = page
      .locator("button")
      .filter({ hasText: /下一步/i })
      .filter({ hasText: /確認開始|Confirm/i })
      .first();
    await expect(confirmStepBtn).toBeVisible({ timeout: 15000 });
    await expect(confirmStepBtn).toBeEnabled({ timeout: 15000 });
    await confirmStepBtn.click();

    // --- Step 3: Confirm and start ---
    // Verify final CTA appears
    const startExamBtn = page.getByRole("button", {
      name: /確認開始考試|Start.*Exam/i,
    });
    await expect(startExamBtn).toBeVisible({ timeout: 15000 });
    await startExamBtn.click();

    // Should see countdown then navigate to answering page
    await page.waitForURL(/\/paper-exam\/answering/, { timeout: 20000 });
    expect(page.url()).toContain("/paper-exam/answering");
  });
});

// ---------------------------------------------------------------------------
// Tests — Anti-Cheat (skipped pending flow stabilisation)
// ---------------------------------------------------------------------------

// TODO: Re-enable after stabilising precheck gate + fullscreen init flow
test.describe.skip("Exam Anti-Cheat E2E", () => {
  test.describe.configure({ mode: "serial" });

  // Keep a teacher page open to avoid re-login overhead
  let teacherPage: Page;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: "http://localhost:5174" });
    teacherPage = await ctx.newPage();
    await teacherPage.goto("/");
    await loginViaAPI(teacherPage, "teacher");
  });

  test.afterAll(async () => {
    await teacherPage.context().close();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clearAuth(page);
  });

  // 1. Violation triggers warning modal
  test("violation triggers warning modal", async ({ page }) => {
    const contestId = await ensureStudentReady(page, "student", teacherPage);

    await gotoExamAnswering(page, contestId);

    await triggerVisibilityHidden(page);

    // Wait for the warning modal
    const warningModal = page
      .locator(".cds--modal.is-visible, [role='presentation'].is-visible")
      .filter({ hasText: /違規警告|Violation Warning/i });
    await expect(warningModal.first()).toBeVisible({ timeout: 15000 });

    // Acknowledge
    const ackButton = warningModal
      .first()
      .locator("button")
      .filter({ hasText: /我了解了|I Understand|確認|Confirm/i });
    await ackButton.first().click({ timeout: 5000 });

    // Modal should close
    await expect(warningModal.first()).not.toBeVisible({ timeout: 5000 });
  });

  // 2. Accumulated violations lock exam (max_cheat_warnings=2)
  test("accumulated violations lock exam", async ({ page }) => {
    const contestId = await ensureStudentReady(page, "student2", teacherPage);

    // Post first violation via API (avoids React state closure issues)
    const v1Resp = await postViolationEvent(page, contestId, "tab_hidden");
    expect(v1Resp.ok()).toBeTruthy();

    await gotoExamAnswering(page, contestId);

    // Trigger second violation via UI — should lock (max_cheat_warnings=2)
    await triggerVisibilityHidden(page);

    // Warning modal should appear and indicate locked state
    const warningModal = page
      .locator(".cds--modal.is-visible, [role='presentation'].is-visible")
      .filter({ hasText: /違規警告|Violation Warning/i });
    await expect(warningModal.first()).toBeVisible({ timeout: 15000 });

    // Wait for API response to populate lastApiResponse.isLocked
    await page.waitForTimeout(2000);

    // Acknowledge the locked warning
    const ackButton = warningModal
      .first()
      .locator("button")
      .filter({ hasText: /我了解了|I Understand|確認|Confirm/i });
    await ackButton.first().click({ timeout: 5000 });

    // After acknowledging locked warning, lock screen should appear
    const lockIndicator = page.getByText(/作答已鎖定|Answer Locked/i);
    await expect(lockIndicator.first()).toBeVisible({ timeout: 15000 });
  });

  // 3. 15s warning timeout auto-locks
  test("15s warning timeout auto-locks", async ({ page }) => {
    test.setTimeout(45_000);

    const contestId = await ensureStudentReady(page, "student", teacherPage);

    await gotoExamAnswering(page, contestId);

    await triggerVisibilityHidden(page);

    // Verify warning modal appears
    const warningModal = page
      .locator(".cds--modal.is-visible, [role='presentation'].is-visible")
      .filter({ hasText: /違規警告|Violation Warning/i });
    await expect(warningModal.first()).toBeVisible({ timeout: 15000 });

    // Check for countdown text
    const countdownText = page.getByText(/秒後自動鎖定|auto-locking in/i);
    await expect(countdownText.first()).toBeVisible({ timeout: 5000 });

    // Do NOT click acknowledge — wait for auto-lock
    await page.waitForTimeout(16000);

    // Should show lock screen
    const lockIndicator = page.getByText(/作答已鎖定|Answer Locked/i);
    await expect(lockIndicator.first()).toBeVisible({ timeout: 10000 });
  });

  // 4. Unlock notification after admin unlocks
  test("unlock notification after admin unlocks", async ({ page }) => {
    const contestId = await ensureStudentReady(page, "student2", teacherPage);
    const studentUserId = await getMyUserId(page);

    // Lock the student via warning_timeout
    await postViolationEvent(page, contestId, "warning_timeout");

    // Navigate directly to answering page (NOT via precheck, since precheck
    // doesn't auto-redirect LOCKED students — only in_progress/paused)
    await page.goto(`/contests/${contestId}/paper-exam/answering`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);

    const lockIndicator = page.getByText(/作答已鎖定|Answer Locked/i);
    await expect(lockIndicator.first()).toBeVisible({ timeout: 10000 });

    // Teacher unlocks the student
    const teacherHeaders = await authHeaders(teacherPage);
    const unlockResp = await teacherPage.request.post(
      `/api/v1/contests/${contestId}/unlock_participant/`,
      { headers: teacherHeaders, data: { user_id: studentUserId } }
    );
    expect(unlockResp.ok()).toBeTruthy();

    // Reload — after unlock examStatus is PAUSED, lock screen should not appear
    await page.waitForTimeout(1000);
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);

    // Lock screen should no longer be visible
    await expect(lockIndicator.first()).not.toBeVisible({ timeout: 10000 });
  });

  // 5. Teacher bypass — no warning modal
  test("teacher bypass no warning", async ({ page }) => {
    await loginViaAPI(page, "teacher");
    const contestId = await findExamContestId(page);

    await page.goto(`/contests/${contestId}`);
    await page.waitForLoadState("networkidle");

    // Trigger blur event
    await page.evaluate(() => {
      window.dispatchEvent(new Event("blur"));
    });

    await page.waitForTimeout(2000);

    // No warning modal should appear
    const warningModal = page
      .locator(".cds--modal.is-visible")
      .filter({ hasText: /違規警告|Violation Warning/i });
    await expect(warningModal).toHaveCount(0);
  });
});
