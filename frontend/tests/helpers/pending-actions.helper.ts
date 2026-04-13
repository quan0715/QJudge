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

export interface TakeoverScenario {
  teacherPage: Page;
  contestId: string;
  classroomId: string;
  deviceA: string;
  cleanup: () => Promise<void>;
}

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

  await teacherPage.goto("/", { waitUntil: "domcontentloaded" });
  await loginViaAPI(teacherPage, "teacher");
  const contestId = await findExamContestId(teacherPage);
  await ensureContestPublishedWithWindow(teacherPage, contestId);
  const classroomId = await getContestClassroomId(teacherPage, contestId);
  await addClassroomStudentMembers(teacherPage, classroomId);
  await resetStudentParticipant(teacherPage, contestId);

  await studentPageA.goto("/", { waitUntil: "domcontentloaded" });
  await studentPageA.evaluate(
    ([k, v]) => localStorage.setItem(k, v),
    [DEVICE_KEY, deviceA] as [string, string],
  );
  await loginViaAPI(studentPageA, "student");
  await prepareStudentPaperExamInProgress(studentPageA, teacherPage, contestId);

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

export async function fillAndSubmitLoginForm(
  page: Page,
  role: keyof typeof TEST_USERS = "student",
): Promise<void> {
  const user = TEST_USERS[role];
  await page.getByTestId("auth-login-email").fill(user.email);
  await page.getByTestId("auth-login-password").fill(user.password);
  await page.getByTestId("auth-login-submit").click();
}

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

export async function getSessionStorageItem(
  page: Page,
  key: string,
): Promise<string | null> {
  return page.evaluate((k) => sessionStorage.getItem(k), key);
}
