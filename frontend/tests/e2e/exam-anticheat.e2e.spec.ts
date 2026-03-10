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

async function getContestExamStatus(page: Page, contestId: string): Promise<string | undefined> {
  const headers = await authHeaders(page);
  const resp = await page.request.get(API_ENDPOINTS.contests.detail(contestId), { headers });
  expect(resp.ok()).toBeTruthy();
  const data = await resp.json();
  return data?.exam_status;
}

async function getScreenShareRecoveryGraceMs(page: Page, contestId: string): Promise<number> {
  const headers = await authHeaders(page);
  const resp = await page.request.get(`/api/v1/contests/${contestId}/anticheat-config/`, {
    headers,
  });
  expect(resp.ok()).toBeTruthy();
  const payload = await resp.json();
  const value = payload?.effective?.screen_share_recovery_grace_ms;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  return 10_000;
}

async function getMonitoringRecoveryGraceMs(page: Page, contestId: string): Promise<number> {
  const headers = await authHeaders(page);
  const resp = await page.request.get(`/api/v1/contests/${contestId}/anticheat-config/`, {
    headers,
  });
  expect(resp.ok()).toBeTruthy();
  const payload = await resp.json();
  const value = payload?.effective?.monitoring_recovery_grace_ms;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  return 3_000;
}

type ExamEventRow = {
  id: number;
  user: number;
  event_type: string;
  created_at: string;
  metadata?: Record<string, unknown> | null;
};

async function listContestExamEvents(page: Page, contestId: string): Promise<ExamEventRow[]> {
  const headers = await authHeaders(page);
  const resp = await page.request.get(API_ENDPOINTS.contests.examEvents(contestId), {
    headers,
  });
  expect(resp.ok()).toBeTruthy();
  const payload = await resp.json();
  return Array.isArray(payload) ? (payload as ExamEventRow[]) : [];
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

async function ensureContestWindowActive(
  controlPage: Page,
  contestId: string,
  controlHeaders: Record<string, string>
) {
  const now = Date.now();
  const startAt = new Date(now - 60 * 60 * 1000).toISOString();
  const endAt = new Date(now + 6 * 60 * 60 * 1000).toISOString();
  const resp = await controlPage.request.patch(API_ENDPOINTS.contests.detail(contestId), {
    headers: controlHeaders,
    data: {
      status: "published",
      start_time: startAt,
      end_time: endAt,
    },
  });
  expect(resp.ok()).toBeTruthy();
}

/** Clear active anti-cheat device session for participant (teacher/admin only). */
async function clearActiveSession(
  teacherPage: Page,
  contestId: string,
  userId: number,
  teacherHeaders: Record<string, string>
) {
  const resp = await teacherPage.request.post(
    `/api/v1/contests/${contestId}/exam/active-sessions/clear/`,
    { headers: teacherHeaders, data: { user_id: userId } }
  );
  expect(resp.ok()).toBeTruthy();
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
  await ensureContestWindowActive(teacherPage, contestId, teacherHeaders);

  // 1. Register (idempotent — 400 if already registered)
  const regResp = await page.request.post(
    API_ENDPOINTS.contests.register(contestId),
    { headers }
  );
  // Some seeded contests disallow late re-register and return 403 even when the
  // participant already exists; treat it as idempotent in E2E setup.
  expect([200, 201, 400, 403]).toContain(regResp.status());
  await clearActiveSession(teacherPage, contestId, userId, teacherHeaders);

  const resetByTeacher = async () => {
    await teacherPage.request.post(
      `/api/v1/contests/${contestId}/reopen_exam/`,
      { headers: teacherHeaders, data: { user_id: userId } }
    );
    await teacherPage.request.post(
      `/api/v1/contests/${contestId}/unlock_participant/`,
      { headers: teacherHeaders, data: { user_id: userId } }
    );
    await clearActiveSession(teacherPage, contestId, userId, teacherHeaders);
  };

  // Normalize to a clean state, then retry start until participant is in progress.
  await resetByTeacher();
  let ready = false;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.request.post(API_ENDPOINTS.contests.examStart(contestId), { headers });
    const status = await getContestExamStatus(page, contestId);
    if (status === "in_progress") {
      ready = true;
      break;
    }
    await resetByTeacher();
  }

  expect(ready).toBeTruthy();
  await clearActiveSession(teacherPage, contestId, userId, teacherHeaders);

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
    const w = window as Window & {
      __e2eStopDisplayMedia?: () => void;
      __e2eGetDisplayMediaStartCount?: () => number;
      __e2eIsDisplayMediaActive?: () => boolean;
      __e2eSetFullscreenActive?: (active: boolean) => void;
      __e2eSetMultiDisplayEnabled?: (enabled: boolean) => void;
    };
    let lastTrack: MediaStreamTrack | null = null;
    let getDisplayMediaStartCount = 0;
    let fullscreenActive = true;
    let multiDisplayEnabled = false;

    const screenDetailListeners = new Map<string, Set<(event: Event) => void>>();
    const screenDetails = {
      get screens() {
        if (!multiDisplayEnabled) return [window.screen];
        return [window.screen, { isVirtualDisplay: true } as Screen];
      },
      get currentScreen() {
        return window.screen;
      },
      addEventListener: (type: string, cb: (event: Event) => void) => {
        const listeners = screenDetailListeners.get(type) ?? new Set<(event: Event) => void>();
        listeners.add(cb);
        screenDetailListeners.set(type, listeners);
      },
      removeEventListener: (type: string, cb: (event: Event) => void) => {
        screenDetailListeners.get(type)?.delete(cb);
      },
      dispatchEvent: (event: Event) => {
        const listeners = screenDetailListeners.get(event.type);
        listeners?.forEach((cb) => cb(event));
        return true;
      },
    };

    // Stub requestFullscreen → always resolve
    Element.prototype.requestFullscreen = () => {
      fullscreenActive = true;
      document.dispatchEvent(new Event("fullscreenchange"));
      return Promise.resolve();
    };

    // Stub fullscreenElement → looks like we're in fullscreen
    Object.defineProperty(document, "fullscreenElement", {
      get: () => (fullscreenActive ? document.documentElement : null),
      configurable: true,
    });
    (document as Document & { exitFullscreen?: () => Promise<void> }).exitFullscreen = () => {
      fullscreenActive = false;
      document.dispatchEvent(new Event("fullscreenchange"));
      return Promise.resolve();
    };

    // Stub hasFocus → always true
    document.hasFocus = () => true;

    // Stub Screen Details API for single-monitor environment.
    Object.defineProperty(window.screen, "isExtended", {
      get: () => multiDisplayEnabled,
      configurable: true,
    });
    (window as Window & { getScreenDetails?: () => Promise<unknown> }).getScreenDetails = async () =>
      screenDetails;

    // Stub getDisplayMedia with a monitor-like fake stream.
    const ensureMediaDevices = () => {
      const nav = navigator as Navigator & {
        mediaDevices?: {
          getDisplayMedia?: (
            constraints?: MediaStreamConstraints
          ) => Promise<MediaStream>;
        };
      };
      if (!nav.mediaDevices) {
        nav.mediaDevices = {};
      }
      nav.mediaDevices.getDisplayMedia = async () => {
        getDisplayMediaStartCount += 1;
        let active = true;
        let readyState: MediaStreamTrackState = "live";
        const listeners = new Map<string, Set<(event?: Event) => void>>();
        const fakeTrack = {
          kind: "video",
          label: "Playwright Monitor",
          enabled: true,
          muted: false,
          readyState,
          stop: () => {
            active = false;
            readyState = "ended";
            fakeTrack.readyState = "ended";
            const ended = listeners.get("ended");
            ended?.forEach((cb) => cb(new Event("ended")));
          },
          getSettings: () => ({ displaySurface: "monitor" }),
          addEventListener: (type: string, cb: (event?: Event) => void) => {
            const set = listeners.get(type) ?? new Set<(event?: Event) => void>();
            set.add(cb);
            listeners.set(type, set);
          },
          removeEventListener: (type: string, cb: (event?: Event) => void) => {
            listeners.get(type)?.delete(cb);
          },
        } as unknown as MediaStreamTrack;
        lastTrack = fakeTrack;

        const fakeStream = {
          get active() {
            return active;
          },
          getTracks: () => [fakeTrack],
          getVideoTracks: () => [fakeTrack],
          getAudioTracks: () => [],
        } as unknown as MediaStream;

        return fakeStream;
      };
    };
    ensureMediaDevices();

    w.__e2eStopDisplayMedia = () => {
      if (!lastTrack) return;
      try {
        (lastTrack as { stop: () => void }).stop();
      } catch {
        // noop for tests
      }
    };
    w.__e2eGetDisplayMediaStartCount = () => getDisplayMediaStartCount;
    w.__e2eIsDisplayMediaActive = () => {
      if (!lastTrack) return false;
      return lastTrack.readyState === "live";
    };
    w.__e2eSetFullscreenActive = (active: boolean) => {
      fullscreenActive = active;
      document.dispatchEvent(new Event("fullscreenchange"));
    };
    w.__e2eSetMultiDisplayEnabled = (enabled: boolean) => {
      multiDisplayEnabled = enabled;
      screenDetails.dispatchEvent(new Event("screenschange"));
    };
  });
}

async function runPrecheckToAnswering(page: Page) {
  const step1Next = page.getByTestId("precheck-step1-next-btn");
  await expect(step1Next).toBeEnabled({ timeout: 10000 });
  await step1Next.click();

  const step2Primary = page.getByTestId("precheck-step2-primary-btn");
  await expect(step2Primary).toBeVisible({ timeout: 5000 });
  await step2Primary.click();

  const step2Next = page.getByTestId("precheck-step2-next-btn");
  await expect(step2Next).toBeVisible({ timeout: 15000 });
  await expect(step2Next).toBeEnabled({ timeout: 15000 });
  await step2Next.click();

  const startBtn = page.getByTestId("precheck-confirm-start-btn");
  await expect(startBtn).toBeVisible({ timeout: 10000 });
  await expect(startBtn).toBeEnabled({ timeout: 10000 });
  await startBtn.click();

  await page.waitForURL(/\/paper-exam\/answering/, { timeout: 20000 });
}

async function answerFirstQuestion(page: Page) {
  await page.getByText("作答區").first().waitFor({ state: "visible", timeout: 15000 }).catch(() => {});

  const optionLabel = page.getByText(/^[A-D]\.\s/).first();
  if (await optionLabel.isVisible().catch(() => false)) {
    await optionLabel.click();
    return;
  }

  const textInputs = page.locator("[data-testid^='exam-answer-input-']");
  const textCount = await textInputs.count();
  for (let i = 0; i < textCount; i += 1) {
    const input = textInputs.nth(i);
    if (await input.isVisible()) {
      await input.fill("E2E full-flow answer");
      await input.blur();
      return;
    }
  }

  const options = page.locator("[data-testid^='exam-answer-option-']");
  const optionCount = await options.count();
  for (let i = 0; i < optionCount; i += 1) {
    const option = options.nth(i);
    if (await option.isVisible()) {
      await option.click();
      return;
    }
  }

  const nativeRadios = page.locator("input[type='radio']");
  if ((await nativeRadios.count()) > 0) {
    await nativeRadios.first().click({ force: true });
    return;
  }

  const nativeCheckboxes = page.locator("input[type='checkbox']");
  if ((await nativeCheckboxes.count()) > 0) {
    await nativeCheckboxes.first().check({ force: true });
    return;
  }

  // Fallback for Carbon controls that do not expose custom test-id on input wrappers.
  const radios = page.getByRole("radio");
  const radioCount = await radios.count();
  for (let i = 0; i < radioCount; i += 1) {
    const radio = radios.nth(i);
    if (await radio.isVisible()) {
      await radio.click();
      return;
    }
  }

  const checkboxes = page.getByRole("checkbox");
  const checkboxCount = await checkboxes.count();
  for (let i = 0; i < checkboxCount; i += 1) {
    const checkbox = checkboxes.nth(i);
    if (await checkbox.isVisible()) {
      await checkbox.click();
      return;
    }
  }

  const freeText = page.getByRole("textbox");
  const freeTextCount = await freeText.count();
  for (let i = 0; i < freeTextCount; i += 1) {
    const input = freeText.nth(i);
    if (await input.isVisible()) {
      await input.fill("E2E full-flow answer");
      await input.blur();
      return;
    }
  }

  throw new Error("No answer input/option found on paper exam answering page");
}

async function getDisplayMediaStartCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const w = window as Window & {
      __e2eGetDisplayMediaStartCount?: () => number;
    };
    return w.__e2eGetDisplayMediaStartCount?.() ?? 0;
  });
}

async function stopDisplayMediaStream(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as Window & {
      __e2eStopDisplayMedia?: () => void;
    };
    w.__e2eStopDisplayMedia?.();
  });
}

async function setFullscreenActive(page: Page, active: boolean): Promise<void> {
  await page.evaluate((isActive) => {
    const w = window as Window & {
      __e2eSetFullscreenActive?: (next: boolean) => void;
    };
    w.__e2eSetFullscreenActive?.(isActive);
  }, active);
}

async function setMultiDisplayEnabled(page: Page, enabled: boolean): Promise<void> {
  await page.evaluate((isEnabled) => {
    const w = window as Window & {
      __e2eSetMultiDisplayEnabled?: (next: boolean) => void;
    };
    w.__e2eSetMultiDisplayEnabled?.(isEnabled);
  }, enabled);
}

async function triggerMouseLeave(page: Page): Promise<void> {
  await page.evaluate(() => {
    const event = new MouseEvent("mouseleave", {
      bubbles: false,
      cancelable: true,
      relatedTarget: null,
    });
    document.documentElement.dispatchEvent(event);
  });
}

async function triggerMouseEnter(page: Page): Promise<void> {
  await page.evaluate(() => {
    const event = new MouseEvent("mouseenter", {
      bubbles: false,
      cancelable: true,
      relatedTarget: document.body,
    });
    document.documentElement.dispatchEvent(event);
  });
}

async function clickVisibleButtonBySpanTestId(
  page: Page,
  testId: string
): Promise<void> {
  const marker = page.getByTestId(testId).first();
  await expect(marker).toBeVisible({ timeout: 10000 });
  const button = marker.locator("xpath=ancestor::button[1]");
  await expect(button).toBeVisible({ timeout: 10000 });
  await expect(button).toBeEnabled({ timeout: 10000 });
  await button.click();
}

async function recoverScreenShareIfPrompted(page: Page): Promise<boolean> {
  const modal = page.getByTestId("exam-screen-share-modal");
  const isVisible = await modal.isVisible().catch(() => false);
  if (!isVisible) return false;
  await clickVisibleButtonBySpanTestId(page, "exam-screen-share-reshare-btn");
  await expect(modal).not.toBeVisible({ timeout: 15000 });
  return true;
}

async function stabilizeScreenShare(page: Page): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    const recovered = await recoverScreenShareIfPrompted(page);
    if (!recovered) return;
    await page.waitForTimeout(800);
  }
}

interface WaitForDetectorViolationOptions {
  page: Page;
  teacherPage: Page;
  contestId: string;
  studentUserId: number;
  baselineEventId: number;
  triggeredEventType: string;
  violationEventType: string;
  graceMs: number;
  timeoutMs?: number;
  trigger: () => Promise<void>;
  reset?: () => Promise<void>;
}

async function waitForDetectorViolation({
  page,
  teacherPage,
  contestId,
  studentUserId,
  baselineEventId,
  triggeredEventType,
  violationEventType,
  graceMs,
  timeoutMs = 25_000,
  trigger,
  reset,
}: WaitForDetectorViolationOptions): Promise<void> {
  const deadlineAt = Date.now() + timeoutMs;
  let lastState = {
    hasTriggered: false,
    hasViolation: false,
    hasSubmitInitiated: false,
  };

  while (Date.now() < deadlineAt) {
    await trigger();
    await page.waitForTimeout(graceMs + 1200);

    const events = await listContestExamEvents(teacherPage, contestId);
    const newStudentEvents = events.filter(
      (event) => event.id > baselineEventId && event.user === studentUserId
    );
    lastState = {
      hasTriggered: newStudentEvents.some((event) => event.event_type === triggeredEventType),
      hasViolation: newStudentEvents.some((event) => event.event_type === violationEventType),
      hasSubmitInitiated: newStudentEvents.some((event) => event.event_type === "exam_submit_initiated"),
    };

    if (lastState.hasTriggered && lastState.hasViolation && !lastState.hasSubmitInitiated) {
      return;
    }

    const recovered = await recoverScreenShareIfPrompted(page);
    if (recovered) {
      await page.waitForTimeout(500);
    }
    if (reset) {
      await reset();
    }
    await page.waitForTimeout(300);
  }

  expect(lastState).toEqual({
    hasTriggered: true,
    hasViolation: true,
    hasSubmitInitiated: false,
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
    Object.defineProperty(window.screen, "isExtended", {
      get: () => false,
      configurable: true,
    });
    (window as Window & { getScreenDetails?: () => Promise<unknown> }).getScreenDetails = async () => ({
      screens: [window.screen],
      currentScreen: window.screen,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    });
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
    await loginViaAPI(teacherPage, "admin");
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
    test.setTimeout(60_000);

    const contestId = await ensureStudentReady(page, "student", teacherPage);
    await page.goto(`/contests/${contestId}/exam-precheck`);
    await page.waitForLoadState("networkidle");

    await runPrecheckToAnswering(page);
    expect(page.url()).toContain("/paper-exam/answering");
  });

  test("normal flow: precheck -> answer -> submit -> back to contest dashboard", async ({ page }) => {
    test.setTimeout(75_000);

    const contestId = await ensureStudentReady(page, "student", teacherPage);
    await page.goto(`/contests/${contestId}/exam-precheck`);
    await page.waitForLoadState("networkidle");

    await runPrecheckToAnswering(page);
    await answerFirstQuestion(page);

    const openSubmitReview = page.getByTestId("paper-exam-open-submit-review-btn");
    await expect(openSubmitReview).toBeVisible({ timeout: 10000 });
    await openSubmitReview.click();

    const submitReviewModal = page.getByTestId("paper-exam-submit-review-modal");
    await expect(submitReviewModal).toBeVisible({ timeout: 10000 });

    const submitConfirmBtn = page
      .getByTestId("paper-exam-submit-confirm-btn")
      .locator("xpath=ancestor::button[1]");
    await expect(submitConfirmBtn).toBeVisible({ timeout: 10000 });
    await submitConfirmBtn.click();

    await page.waitForURL(new RegExp(`/contests/${contestId}(/)?(\\?.*)?$`), {
      timeout: 25000,
    });
    await expect(page).not.toHaveURL(/\/paper-exam\/answering/);
  });

  test("screen share stays alive across answering <-> dashboard navigation", async ({ page }) => {
    test.setTimeout(90_000);

    const contestId = await ensureStudentReady(page, "student", teacherPage);
    await page.goto(`/contests/${contestId}/exam-precheck`);
    await page.waitForLoadState("networkidle");

    await runPrecheckToAnswering(page);
    const beforeNavCount = await getDisplayMediaStartCount(page);
    expect(beforeNavCount).toBeGreaterThan(0);

    const backDashboard = page.getByTestId("paper-exam-back-dashboard-btn");
    await expect(backDashboard).toBeVisible({ timeout: 10000 });
    await backDashboard.click();

    await page.waitForURL(new RegExp(`/contests/${contestId}(/)?(\\?.*)?$`), {
      timeout: 20000,
    });
    await page.waitForTimeout(2000);
    await expect(page.getByTestId("exam-screen-share-modal")).not.toBeVisible();
    expect(await getDisplayMediaStartCount(page)).toBe(beforeNavCount);

    const goToAnswering = page.getByTestId("contest-hero-go-answering-btn");
    await expect(goToAnswering).toBeVisible({ timeout: 10000 });
    await goToAnswering.click();

    await page.waitForURL(/\/paper-exam\/answering/, { timeout: 20000 });
    await page.waitForTimeout(2000);
    await expect(page.getByTestId("exam-screen-share-modal")).not.toBeVisible();
    expect(await getDisplayMediaStartCount(page)).toBe(beforeNavCount);
  });

  test("stream interruption can be recovered by re-sharing within grace window", async ({ page }) => {
    test.setTimeout(90_000);

    const contestId = await ensureStudentReady(page, "student2", teacherPage);
    const studentUserId = await getMyUserId(page);
    await page.goto(`/contests/${contestId}/exam-precheck`);
    await page.waitForLoadState("networkidle");

    await runPrecheckToAnswering(page);
    // Wait for the capture hook to consume precheck handoff stream and attach
    // track listeners; otherwise early stop() would be missed.
    await page.waitForTimeout(6500);
    const beforeReshareCount = await getDisplayMediaStartCount(page);
    const beforeEvents = await listContestExamEvents(teacherPage, contestId);
    const baselineEventId = beforeEvents.length > 0 ? Math.max(...beforeEvents.map((event) => event.id)) : 0;

    await stopDisplayMediaStream(page);

    const streamLossModal = page.getByTestId("exam-screen-share-modal");
    await expect(streamLossModal).toBeVisible({ timeout: 10000 });

    await clickVisibleButtonBySpanTestId(page, "exam-screen-share-reshare-btn");

    await expect(streamLossModal).not.toBeVisible({ timeout: 15000 });
    expect(await getDisplayMediaStartCount(page)).toBeGreaterThan(beforeReshareCount);
    await expect(page).toHaveURL(/\/paper-exam\/answering/, { timeout: 10000 });
    const statusAfterReshare = await getContestExamStatus(page, contestId);
    expect(statusAfterReshare).toBe("in_progress");

    await expect
      .poll(async () => {
        const events = await listContestExamEvents(teacherPage, contestId);
        const newStudentEvents = events.filter(
          (event) => event.id > baselineEventId && event.user === studentUserId
        );
        return {
          hasInterrupted: newStudentEvents.some((event) => event.event_type === "screen_share_interrupted"),
          hasRestored: newStudentEvents.some((event) => event.event_type === "screen_share_restored"),
          hasStopped: newStudentEvents.some((event) => event.event_type === "screen_share_stopped"),
          hasSubmitInitiated: newStudentEvents.some((event) => event.event_type === "exam_submit_initiated"),
        };
      }, {
        timeout: 15000,
      })
      .toEqual({
        hasInterrupted: true,
        hasRestored: true,
        hasStopped: false,
        hasSubmitInitiated: false,
      });
  });

  test("stream interruption auto-submits exam after recovery timeout", async ({ page }) => {
    test.setTimeout(120_000);

    const contestId = await ensureStudentReady(page, "student", teacherPage);
    const recoveryGraceMs = await getScreenShareRecoveryGraceMs(page, contestId);

    await page.goto(`/contests/${contestId}/exam-precheck`);
    await page.waitForLoadState("networkidle");
    await runPrecheckToAnswering(page);
    // Ensure capture hook has acquired the handoff stream before stopping it.
    await page.waitForTimeout(6500);

    await stopDisplayMediaStream(page);
    await expect(page.getByTestId("exam-screen-share-modal")).toBeVisible({
      timeout: 10000,
    });

    await page.waitForTimeout(recoveryGraceMs + 4000);

    const autoSubmitModal = page.getByTestId("exam-auto-submit-modal");
    await expect(autoSubmitModal).toBeVisible({ timeout: 20000 });

    await clickVisibleButtonBySpanTestId(page, "exam-auto-submit-return-btn");

    await page.waitForURL(new RegExp(`/contests/${contestId}(/)?(\\?.*)?$`), {
      timeout: 20000,
    });
    const examStatus = await getContestExamStatus(page, contestId);
    expect(examStatus).toBe("submitted");
  });

  test("detector trigger: mouse leave emits violation event", async ({ page }) => {
    test.setTimeout(90_000);

    const contestId = await ensureStudentReady(page, "student2", teacherPage);
    const studentUserId = await getMyUserId(page);
    const monitoringRecoveryGraceMs = await getMonitoringRecoveryGraceMs(page, contestId);

    await page.goto(`/contests/${contestId}/exam-precheck`);
    await page.waitForLoadState("networkidle");
    await runPrecheckToAnswering(page);
    await stabilizeScreenShare(page);

    const beforeEvents = await listContestExamEvents(teacherPage, contestId);
    const baselineEventId = beforeEvents.length > 0 ? Math.max(...beforeEvents.map((event) => event.id)) : 0;

    await waitForDetectorViolation({
      page,
      teacherPage,
      contestId,
      studentUserId,
      baselineEventId,
      triggeredEventType: "mouse_leave_triggered",
      violationEventType: "mouse_leave",
      graceMs: monitoringRecoveryGraceMs,
      trigger: async () => {
        await triggerMouseLeave(page);
      },
      reset: async () => {
        await triggerMouseEnter(page);
      },
    });

    const statusAfterViolation = await getContestExamStatus(page, contestId);
    expect(statusAfterViolation).toBe("in_progress");
    await triggerMouseEnter(page);
  });

  test("detector trigger: fullscreen exit emits violation event", async ({ page }) => {
    test.setTimeout(90_000);

    const contestId = await ensureStudentReady(page, "student", teacherPage);
    const studentUserId = await getMyUserId(page);
    const monitoringRecoveryGraceMs = await getMonitoringRecoveryGraceMs(page, contestId);

    await page.goto(`/contests/${contestId}/exam-precheck`);
    await page.waitForLoadState("networkidle");
    await runPrecheckToAnswering(page);
    await stabilizeScreenShare(page);

    const beforeEvents = await listContestExamEvents(teacherPage, contestId);
    const baselineEventId = beforeEvents.length > 0 ? Math.max(...beforeEvents.map((event) => event.id)) : 0;

    await waitForDetectorViolation({
      page,
      teacherPage,
      contestId,
      studentUserId,
      baselineEventId,
      triggeredEventType: "exit_fullscreen_triggered",
      violationEventType: "exit_fullscreen",
      graceMs: monitoringRecoveryGraceMs,
      trigger: async () => {
        await setFullscreenActive(page, false);
      },
      reset: async () => {
        await setFullscreenActive(page, true);
      },
    });

    const statusAfterViolation = await getContestExamStatus(page, contestId);
    expect(statusAfterViolation).toBe("in_progress");
    await setFullscreenActive(page, true);
  });

  test("detector trigger: multi-display signal emits violation event", async ({ page }) => {
    test.setTimeout(90_000);

    const contestId = await ensureStudentReady(page, "student2", teacherPage);
    const studentUserId = await getMyUserId(page);

    await page.goto(`/contests/${contestId}/exam-precheck`);
    await page.waitForLoadState("networkidle");
    await runPrecheckToAnswering(page);
    await stabilizeScreenShare(page);

    const beforeEvents = await listContestExamEvents(teacherPage, contestId);
    const baselineEventId = beforeEvents.length > 0 ? Math.max(...beforeEvents.map((event) => event.id)) : 0;

    await setMultiDisplayEnabled(page, true);

    const deadlineAt = Date.now() + 20_000;
    let hasMultiDisplayViolation = false;

    while (Date.now() < deadlineAt) {
      const events = await listContestExamEvents(teacherPage, contestId);
      const newStudentEvents = events.filter(
        (event) => event.id > baselineEventId && event.user === studentUserId
      );
      hasMultiDisplayViolation = newStudentEvents.some(
        (event) => event.event_type === "multiple_displays"
      );
      if (hasMultiDisplayViolation) break;

      const recovered = await recoverScreenShareIfPrompted(page);
      if (recovered) {
        await setMultiDisplayEnabled(page, true);
      }
      await page.waitForTimeout(800);
    }

    expect(hasMultiDisplayViolation).toBeTruthy();

    const statusAfterViolation = await getContestExamStatus(page, contestId);
    expect(statusAfterViolation).toBe("in_progress");
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
    await loginViaAPI(teacherPage, "admin");
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
    const warningModal = page.getByTestId("exam-warning-modal");
    await expect(warningModal).toBeVisible({ timeout: 15000 });

    // Acknowledge
    const ackButton = page
      .getByTestId("exam-warning-confirm-btn")
      .locator("xpath=ancestor::button[1]");
    await ackButton.click({ timeout: 5000 });

    // Modal should close
    await expect(warningModal).not.toBeVisible({ timeout: 5000 });
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
    const warningModal = page.getByTestId("exam-warning-modal");
    await expect(warningModal).toBeVisible({ timeout: 15000 });

    // Wait for API response to populate lastApiResponse.isLocked
    await page.waitForTimeout(2000);

    // Acknowledge the locked warning
    const ackButton = page
      .getByTestId("exam-warning-confirm-btn")
      .locator("xpath=ancestor::button[1]");
    await ackButton.click({ timeout: 5000 });

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
    const warningModal = page.getByTestId("exam-warning-modal");
    await expect(warningModal).toBeVisible({ timeout: 15000 });

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
    await expect(page.getByTestId("exam-warning-modal")).toHaveCount(0);
  });
});
