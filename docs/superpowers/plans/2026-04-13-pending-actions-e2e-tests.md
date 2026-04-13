# Pending Actions E2E Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** E2E 測試覆蓋所有 pending action 流程（exam takeover、classroom join、teacher activation、註冊後 redirect），確保「登入前記住意圖 → 登入/註冊後自動完成」的行為正確。

**Architecture:** 每個 pending action 一個 spec 檔。共用 helper 抽到 `tests/helpers/pending-actions.helper.ts`。所有測試透過 API 準備前置資料（teacher 帳號建考試/教室/invite），再用 UI 驗證使用者端流程。

**Tech Stack:** Playwright, seed_e2e_data fixtures, existing helpers (auth.helper.ts, exam-lifecycle.helper.ts, exam-precheck.helper.ts)

---

## File Structure

| File | Purpose |
|------|---------|
| Create: `tests/helpers/pending-actions.helper.ts` | 共用 helper：建教室、建 invite、準備 takeover 場景、驗證 sessionStorage |
| Create: `tests/e2e/pending-actions-exam-takeover.e2e.spec.ts` | exam takeover 全流程（主要 spec） |
| Create: `tests/e2e/pending-actions-classroom-join.e2e.spec.ts` | classroom join 透過登入流 |
| Create: `tests/e2e/pending-actions-register-redirect.e2e.spec.ts` | 註冊後直接登入 + pending action 保留 |
| Modify: `tests/helpers/data.helper.ts` | 補 `resolve-conflict` endpoint 常數 |

---

### Task 1: Add resolve-conflict endpoint to data.helper.ts

**Files:**
- Modify: `frontend/tests/helpers/data.helper.ts:156-183`

- [ ] **Step 1: Add endpoint constant**

```ts
// In API_ENDPOINTS.auth, add:
  auth: {
    login: "/api/v1/auth/email/login",
    register: "/api/v1/auth/email/register",
    me: "/api/v1/auth/me",
    resolveConflict: "/api/v1/auth/resolve-conflict",  // ← add
  },
```

- [ ] **Step 2: Commit**

```bash
git add frontend/tests/helpers/data.helper.ts
git commit -m "test: add resolve-conflict endpoint to data helper"
```

---

### Task 2: Create pending-actions.helper.ts

**Files:**
- Create: `frontend/tests/helpers/pending-actions.helper.ts`

- [ ] **Step 1: Create helper with exam takeover scenario setup**

```ts
/**
 * Pending Actions E2E Helpers
 *
 * Shared setup functions for pending action E2E tests.
 */
import { expect, type Browser, type Page } from "@playwright/test";
import { loginViaAPI } from "./auth.helper";
import { API_ENDPOINTS, TEST_CONTESTS, TEST_USERS } from "./data.helper";
import {
  addClassroomStudentMembers,
  authHeaders,
  ensureContestPublishedWithWindow,
  prepareStudentPaperExamInProgress,
} from "./exam-lifecycle.helper";
import { getContestClassroomId } from "./exam-precheck.helper";

const DEVICE_KEY = "qjudge.device_id.v1";

// ── Exam Takeover ──────────────────────────────────────────────────

export interface TakeoverScenario {
  teacherPage: Page;
  contestId: string;
  classroomId: string;
  deviceA: string;
  /** Call this in afterAll to clean up browser contexts */
  cleanup: () => Promise<void>;
}

/**
 * Prepare exam takeover scenario:
 * 1. teacher publishes exam contest with active time window
 * 2. student logs in on device A and starts exam (status: in_progress)
 *
 * After this, logging in as student from a different device will get 403 EXAM_TAKEOVER_REQUIRED.
 */
export async function prepareExamTakeoverScenario(
  browser: Browser,
  baseURL: string,
): Promise<TakeoverScenario> {
  const deviceA = `e2e-takeover-a-${Date.now()}`;

  const teacherCtx = await browser.newContext({ baseURL });
  const studentCtxA = await browser.newContext({
    baseURL,
    extraHTTPHeaders: { "X-Device-Id": deviceA },
  });

  const teacherPage = await teacherCtx.newPage();
  const studentPageA = await studentCtxA.newPage();

  // Teacher: login, find contest, publish
  await teacherPage.goto("/", { waitUntil: "domcontentloaded" });
  await loginViaAPI(teacherPage, "teacher");
  const contestId = await findExamContestId(teacherPage);
  await ensureContestPublishedWithWindow(teacherPage, contestId);
  const classroomId = await getContestClassroomId(teacherPage, contestId);
  await addClassroomStudentMembers(teacherPage, classroomId);
  await resetStudentParticipant(teacherPage, contestId);

  // Student device A: login and start exam
  await studentPageA.goto("/", { waitUntil: "domcontentloaded" });
  await studentPageA.evaluate(
    ([k, v]) => localStorage.setItem(k, v),
    [DEVICE_KEY, deviceA] as [string, string],
  );
  await loginViaAPI(studentPageA, "student");
  await prepareStudentPaperExamInProgress(studentPageA, teacherPage, contestId);

  // Close student A — we only need teacher context alive for cleanup
  await studentPageA.close();
  await studentCtxA.close();

  return {
    teacherPage,
    contestId,
    classroomId,
    deviceA,
    cleanup: async () => {
      await resetStudentParticipant(teacherPage, contestId).catch(() => {});
      await teacherPage.close();
      await teacherCtx.close();
    },
  };
}

/** Reset student participant to not_started so the test is re-runnable. */
export async function resetStudentParticipant(
  teacherPage: Page,
  contestId: string,
): Promise<void> {
  const headers = await authHeaders(teacherPage);
  const pResp = await teacherPage.request.get(
    `/api/v1/contests/${contestId}/participants/`,
    { headers },
  );
  if (!pResp.ok()) return;
  const rows = (await pResp.json()) as { username?: string; user_id?: number }[];
  const row = (Array.isArray(rows) ? rows : []).find(
    (r) => r.username === TEST_USERS.student.username,
  );
  if (row?.user_id == null) return;
  await teacherPage.request
    .patch(`/api/v1/contests/${contestId}/update_participant/`, {
      headers,
      data: { user_id: row.user_id, exam_status: "not_started" },
    })
    .catch(() => null);
}

async function findExamContestId(page: Page): Promise<string> {
  const headers = await authHeaders(page);
  const resp = await page.request.get(API_ENDPOINTS.contests.list, { headers });
  expect(resp.ok()).toBeTruthy();
  const body = await resp.json();
  const list = Array.isArray(body) ? body : (body.results ?? []);
  const contest = list.find(
    (c: { name: string }) => c.name === TEST_CONTESTS.examMode.name,
  );
  expect(contest, `Seed contest "${TEST_CONTESTS.examMode.name}" not found`).toBeTruthy();
  return String(contest.id);
}

// ── Login via UI ───────────────────────────────────────────────────

/**
 * Fill login form and submit (does NOT wait for navigation — caller decides).
 * Returns immediately after clicking the submit button.
 */
export async function fillAndSubmitLoginForm(
  page: Page,
  role: keyof typeof TEST_USERS = "student",
): Promise<void> {
  const user = TEST_USERS[role];
  await page.getByTestId("auth-login-email").fill(user.email);
  await page.getByTestId("auth-login-password").fill(user.password);
  await page.getByTestId("auth-login-submit").click();
}

// ── Registration ───────────────────────────────────────────────────

/**
 * Register a fresh account with random email. Returns credentials.
 * The user will be logged in after this (cookies set by backend).
 */
export async function registerFreshAccount(
  page: Page,
): Promise<{ email: string; password: string; username: string }> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const email = `e2e-test-${suffix}@example.com`;
  const username = `e2e_${suffix}`;
  const password = "TestPass123!";

  await page.getByTestId("auth-register-username").fill(username);
  await page.getByTestId("auth-register-email").fill(email);
  await page.getByTestId("auth-register-password").fill(password);
  await page.getByTestId("auth-register-password-confirm").fill(password);
  await page.getByTestId("auth-register-submit").click();

  return { email, password, username };
}

// ── SessionStorage assertions ──────────────────────────────────────

export async function getSessionStorageItem(
  page: Page,
  key: string,
): Promise<string | null> {
  return page.evaluate((k) => sessionStorage.getItem(k), key);
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/tests/helpers/pending-actions.helper.ts
git commit -m "test: add pending actions E2E helpers"
```

---

### Task 3: Exam takeover E2E spec

**Files:**
- Create: `frontend/tests/e2e/pending-actions-exam-takeover.e2e.spec.ts`

- [ ] **Step 1: Create the spec**

```ts
/**
 * Exam Takeover — Pending Action E2E
 *
 * Validates the full takeover flow through the pending actions system:
 * login blocked → store token → /exam-takeover screen → resolve → contest dashboard
 *
 * Depends on seed: E2E Exam Mode Contest, teacher/student accounts.
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
const TAKEOVER_STORAGE_KEY = "qjudge.exam_takeover_token";

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

  test("login from different device shows takeover screen and redirects to contest dashboard", async ({
    browser,
  }, testInfo) => {
    const baseURL =
      testInfo.project.use.baseURL ||
      process.env.PLAYWRIGHT_BASE_URL ||
      process.env.E2E_BASE_URL ||
      "http://localhost:5174";
    const deviceB = `e2e-takeover-b-${Date.now()}`;
    const ctx = await browser.newContext({
      baseURL,
      extraHTTPHeaders: { "X-Device-Id": deviceB },
    });
    const page = await ctx.newPage();

    try {
      // Set device ID in localStorage
      await page.goto("/login", { waitUntil: "domcontentloaded" });
      await page.evaluate(
        ([k, v]) => localStorage.setItem(k, v),
        [DEVICE_KEY, deviceB] as [string, string],
      );

      // Fill login form and submit
      await fillAndSubmitLoginForm(page, "student");

      // Should redirect to /exam-takeover
      await page.waitForURL("**/exam-takeover", { timeout: 15000 });

      // Verify conflict token stored in sessionStorage
      const token = await getSessionStorageItem(page, TAKEOVER_STORAGE_KEY);
      expect(token).toBeTruthy();

      // Verify takeover button is visible
      const takeoverBtn = page.getByTestId("auth-exam-takeover-btn");
      await expect(takeoverBtn).toBeVisible({ timeout: 5000 });

      // Click takeover
      await takeoverBtn.click();

      // Should show step progress text
      await expect(page.getByText(/清除|清空|Clearing/)).toBeVisible({ timeout: 5000 });

      // Should redirect to contest dashboard (not /dashboard)
      await page.waitForURL(
        new RegExp(`/classrooms/[^/]+/contest/${scenario.contestId}`),
        { timeout: 20000 },
      );

      // Verify we're on the contest dashboard, not /dashboard
      expect(page.url()).toContain(`/contest/${scenario.contestId}`);
      expect(page.url()).not.toMatch(/\/dashboard$/);
    } finally {
      await page.close();
      await ctx.close();
    }
  });

  test("old device token is invalidated after takeover", async ({
    browser,
  }, testInfo) => {
    const baseURL =
      testInfo.project.use.baseURL ||
      process.env.PLAYWRIGHT_BASE_URL ||
      process.env.E2E_BASE_URL ||
      "http://localhost:5174";
    const deviceB = `e2e-takeover-invalidate-${Date.now()}`;

    // Prepare: get device A's token before takeover
    const ctxA = await browser.newContext({
      baseURL,
      extraHTTPHeaders: { "X-Device-Id": scenario.deviceA },
    });
    const pageA = await ctxA.newPage();
    await pageA.goto("/", { waitUntil: "domcontentloaded" });
    await loginViaAPI(pageA, "student");
    const oldToken = await pageA.evaluate(() => localStorage.getItem("token"));
    expect(oldToken).toBeTruthy();

    // Perform takeover from device B via API
    const ctxB = await browser.newContext({
      baseURL,
      extraHTTPHeaders: { "X-Device-Id": deviceB },
    });
    const pageB = await ctxB.newPage();
    const loginResp = await pageB.request.post(API_ENDPOINTS.auth.login, {
      data: {
        email: TEST_USERS.student.email,
        password: TEST_USERS.student.password,
      },
    });
    expect(loginResp.status()).toBe(403);
    const body = await loginResp.json();
    expect(body.code).toBe("EXAM_TAKEOVER_REQUIRED");

    const resolveResp = await pageB.request.post(
      API_ENDPOINTS.auth.resolveConflict,
      {
        data: {
          conflict_token: body.conflict_token,
          action: "takeover_recovery",
        },
      },
    );
    expect(resolveResp.ok()).toBeTruthy();

    // Verify old token is rejected
    const checkResp = await pageA.request.get(API_ENDPOINTS.auth.me, {
      headers: { Authorization: `Bearer ${oldToken}` },
    });
    // Should be 401 or 403 (token blacklisted)
    expect([401, 403]).toContain(checkResp.status());

    await pageA.close();
    await pageB.close();
    await ctxA.close();
    await ctxB.close();
  });

  test("same device login does not trigger takeover", async ({
    browser,
  }, testInfo) => {
    const baseURL =
      testInfo.project.use.baseURL ||
      process.env.PLAYWRIGHT_BASE_URL ||
      process.env.E2E_BASE_URL ||
      "http://localhost:5174";
    // Login with same device ID as the active session
    const ctx = await browser.newContext({
      baseURL,
      extraHTTPHeaders: { "X-Device-Id": scenario.deviceA },
    });
    const page = await ctx.newPage();
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const resp = await page.request.post(API_ENDPOINTS.auth.login, {
      data: {
        email: TEST_USERS.student.email,
        password: TEST_USERS.student.password,
      },
    });
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body.success).toBe(true);

    await page.close();
    await ctx.close();
  });

  test("no active exam does not trigger takeover", async ({ page }) => {
    // student2 has no active exam
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.getByTestId("auth-login-email").fill(TEST_USERS.student2.email);
    await page.getByTestId("auth-login-password").fill(TEST_USERS.student2.password);
    await page.getByTestId("auth-login-submit").click();

    // Should NOT go to /exam-takeover — should go to /dashboard or /onboarding
    await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 15000 });
    expect(page.url()).not.toContain("/exam-takeover");
  });
});
```

- [ ] **Step 2: Run test to verify it works**

```bash
cd frontend && npx playwright test pending-actions-exam-takeover --reporter=list 2>&1 | tail -20
```

Expected: Tests should pass (or fail for real bugs that need fixing).

- [ ] **Step 3: Commit**

```bash
git add frontend/tests/e2e/pending-actions-exam-takeover.e2e.spec.ts
git commit -m "test(e2e): add exam takeover pending action tests"
```

---

### Task 4: Classroom join E2E spec

**Files:**
- Create: `frontend/tests/e2e/pending-actions-classroom-join.e2e.spec.ts`

- [ ] **Step 1: Create the spec**

```ts
/**
 * Classroom Join — Pending Action E2E
 *
 * Validates: unauthenticated user visits /classrooms/join/CODE
 * → redirected to login → logs in → auto-redirected back → joins classroom.
 *
 * Depends on seed: teacher account, E2E Test Classroom.
 */
import { expect, test } from "@playwright/test";
import { clearAuth, loginViaAPI } from "../helpers/auth.helper";
import { TEST_USERS } from "../helpers/data.helper";
import {
  fillAndSubmitLoginForm,
  getSessionStorageItem,
} from "../helpers/pending-actions.helper";

const CLASSROOM_JOIN_STORAGE_KEY = "qjudge.classroom_join_code";

/** Create a classroom via API and return its invite code. */
async function createClassroomWithInviteCode(
  page: Page,
): Promise<{ classroomId: string; inviteCode: string }> {
  const token = await page.evaluate(() => localStorage.getItem("token"));
  expect(token).toBeTruthy();
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const name = `E2E Join Test ${Date.now()}`;
  const resp = await page.request.post("/api/v1/classrooms/", {
    headers,
    data: { name },
  });
  expect(resp.ok(), await resp.text().catch(() => "")).toBeTruthy();
  const body = await resp.json();
  const classroom = body?.data ?? body;
  return {
    classroomId: String(classroom.id ?? classroom.uuid),
    inviteCode: String(classroom.invite_code ?? classroom.inviteCode),
  };
}

import type { Page } from "@playwright/test";

test.describe("Classroom join via pending actions", () => {
  let inviteCode: string;
  let classroomId: string;

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
    const result = await createClassroomWithInviteCode(page);
    inviteCode = result.inviteCode;
    classroomId = result.classroomId;
    await page.close();
    await ctx.close();
  });

  test("unauthenticated visit to /classrooms/join/CODE → login → auto-join", async ({
    page,
  }) => {
    await clearAuth(page);

    // Visit join page while unauthenticated
    await page.goto(`/classrooms/join/${inviteCode}`, {
      waitUntil: "domcontentloaded",
    });

    // Should redirect to login
    await page.waitForURL("**/login**", { timeout: 10000 });

    // Verify pending action stored in sessionStorage
    const stored = await getSessionStorageItem(page, CLASSROOM_JOIN_STORAGE_KEY);
    expect(stored).toBe(inviteCode);

    // Login as student2 (not already in the classroom)
    await fillAndSubmitLoginForm(page, "student2");

    // Should redirect to /classrooms/join/CODE after login
    await page.waitForURL(new RegExp(`/classrooms/join/${inviteCode}`), {
      timeout: 15000,
    });

    // Should eventually land on the classroom page after joining
    await page.waitForURL(/\/classrooms\/[a-f0-9-]+(?:\/|$)/, {
      timeout: 15000,
    });
    expect(page.url()).not.toContain("/login");
    expect(page.url()).not.toContain("/join/");
  });

  test("pending action banner shows on login page", async ({ page }) => {
    await clearAuth(page);
    await page.goto(`/classrooms/join/${inviteCode}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForURL("**/login**", { timeout: 10000 });

    // PendingActionBanner should be visible
    const notification = page.locator(".cds--inline-notification");
    await expect(notification).toBeVisible({ timeout: 5000 });
  });
});
```

- [ ] **Step 2: Run and verify**

```bash
cd frontend && npx playwright test pending-actions-classroom-join --reporter=list 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add frontend/tests/e2e/pending-actions-classroom-join.e2e.spec.ts
git commit -m "test(e2e): add classroom join pending action tests"
```

---

### Task 5: Register redirect E2E spec

**Files:**
- Create: `frontend/tests/e2e/pending-actions-register-redirect.e2e.spec.ts`

- [ ] **Step 1: Create the spec**

```ts
/**
 * Register Redirect — Pending Action E2E
 *
 * Validates:
 * 1. Registration auto-logs-in (no re-login needed)
 * 2. Pending actions survive login→register navigation
 */
import { expect, test } from "@playwright/test";
import { clearAuth } from "../helpers/auth.helper";
import {
  registerFreshAccount,
} from "../helpers/pending-actions.helper";

test.describe("Registration + pending actions", () => {
  test("register goes directly to onboarding without re-login", async ({
    page,
  }) => {
    await clearAuth(page);
    await page.goto("/register", { waitUntil: "domcontentloaded" });

    await registerFreshAccount(page);

    // Should go to /onboarding (new user, no onboarding_completed_at)
    await page.waitForURL("**/onboarding**", { timeout: 15000 });
    expect(page.url()).toContain("/onboarding");
    // Should NOT be on /login
    expect(page.url()).not.toContain("/login");
  });

  test("pending classroom join survives login→register navigation", async ({
    page,
  }) => {
    await clearAuth(page);

    // Simulate having a pending classroom join in sessionStorage
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.evaluate((key) => {
      sessionStorage.setItem(key, "FAKECODE");
    }, "qjudge.classroom_join_code");

    // Click "立即註冊" link to go to register page
    await page.getByTestId("auth-login-nav-register").click();
    await page.waitForURL("**/register**", { timeout: 5000 });

    // Verify sessionStorage preserved
    const stored = await page.evaluate((key) => {
      return sessionStorage.getItem(key);
    }, "qjudge.classroom_join_code");
    expect(stored).toBe("FAKECODE");
  });
});
```

- [ ] **Step 2: Run and verify**

```bash
cd frontend && npx playwright test pending-actions-register-redirect --reporter=list 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add frontend/tests/e2e/pending-actions-register-redirect.e2e.spec.ts
git commit -m "test(e2e): add registration redirect and pending action persistence tests"
```

---

### Task 6: Run all pending action specs together

- [ ] **Step 1: Run full suite**

```bash
cd frontend && npx playwright test --grep "pending-actions" --reporter=list 2>&1
```

Expected: All specs pass.

- [ ] **Step 2: Fix any failures**

If any test fails due to timing, selectors, or real bugs — fix and re-run.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "test(e2e): pending actions E2E suite complete"
```

---

## Notes

- **Exam takeover tests** use dual `BrowserContext` with different `X-Device-Id` headers (same pattern as existing `exam-login-dual-device.e2e.spec.ts`)
- **Classroom join tests** need a fresh classroom per run to avoid "already a member" conflicts; `createClassroomWithInviteCode` handles this
- **Register tests** use random emails (`e2e-test-{timestamp}@example.com`) to avoid account conflicts
- **Teacher activation** is intentionally omitted from this plan — it requires admin API to issue invites, which adds complexity; can be added as a follow-up once the core 3 specs are stable
- All specs clean up after themselves (reset participant status, close contexts)
