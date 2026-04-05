/**
 * 雙 BrowserContext + 雙 X-Device-Id：驗證考試進行中於另一裝置無法用同一帳號 email 登入。
 *
 * 依賴 seed：E2E Exam Mode Contest、teacher/student 帳號。
 */
import { expect, test, type Page } from "@playwright/test";
import { loginViaAPI } from "../helpers/auth.helper";
import { API_ENDPOINTS, TEST_CONTESTS, TEST_USERS } from "../helpers/data.helper";
import {
  addClassroomStudentMembers,
  prepareStudentPaperExamInProgress,
} from "../helpers/exam-lifecycle.helper";
import { getContestClassroomId } from "../helpers/exam-precheck.helper";

const DEVICE_KEY = "qjudge.device_id.v1";

async function findExamContestId(page: Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem("token"));
  expect(token).toBeTruthy();
  const headers = { Authorization: `Bearer ${token}` };
  const resp = await page.request.get(API_ENDPOINTS.contests.list, { headers });
  expect(resp.ok()).toBeTruthy();
  const body = await resp.json();
  const list = Array.isArray(body) ? body : (body.results ?? []);
  const contest = list.find((c: { name: string }) => c.name === TEST_CONTESTS.examMode.name);
  expect(contest).toBeTruthy();
  return String(contest.id);
}

async function ensureContestWindowPublished(teacherPage: Page, contestId: string): Promise<void> {
  const token = await teacherPage.evaluate(() => localStorage.getItem("token"));
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const now = Date.now();
  const resp = await teacherPage.request.patch(API_ENDPOINTS.contests.detail(contestId), {
    headers,
    data: {
      status: "published",
      start_time: new Date(now - 60 * 60 * 1000).toISOString(),
      end_time: new Date(now + 6 * 60 * 60 * 1000).toISOString(),
    },
  });
  expect(resp.ok()).toBeTruthy();
}

async function resetSeedStudentParticipantIfPresent(
  teacherPage: Page,
  contestId: string,
): Promise<number | null> {
  const token = await teacherPage.evaluate(() => localStorage.getItem("token"));
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const pResp = await teacherPage.request.get(`/api/v1/contests/${contestId}/participants/`, {
    headers,
  });
  if (!pResp.ok()) return null;
  const rows = (await pResp.json()) as { username?: string; user_id?: number }[];
  const list = Array.isArray(rows) ? rows : [];
  const row = list.find((r) => r.username === TEST_USERS.student.username);
  if (row?.user_id == null) return null;
  await teacherPage.request
    .patch(`/api/v1/contests/${contestId}/update_participant/`, {
      headers,
      data: { user_id: row.user_id, exam_status: "not_started" },
    })
    .catch(() => null);
  return row.user_id;
}

test.describe("Exam login blocked — dual device (Playwright)", () => {
  test("active exam on device A blocks email login from context B (different X-Device-Id)", async ({
    browser,
    baseURL,
  }) => {
    const resolvedBase =
      baseURL ||
      process.env.PLAYWRIGHT_BASE_URL ||
      process.env.E2E_BASE_URL ||
      "http://localhost:5174";
    const deviceA = `e2e-dual-a-${Date.now()}`;
    const deviceB = `e2e-dual-b-${Date.now()}`;

    const teacherCtx = await browser.newContext({ baseURL: resolvedBase });
    const studentCtxA = await browser.newContext({
      baseURL: resolvedBase,
      extraHTTPHeaders: { "X-Device-Id": deviceA },
    });
    const studentCtxB = await browser.newContext({
      baseURL: resolvedBase,
      extraHTTPHeaders: { "X-Device-Id": deviceB },
    });

    const teacherPage = await teacherCtx.newPage();
    const studentPageA = await studentCtxA.newPage();

    await teacherPage.goto("/", { waitUntil: "domcontentloaded" });
    await loginViaAPI(teacherPage, "teacher");
    const contestId = await findExamContestId(teacherPage);
    await ensureContestWindowPublished(teacherPage, contestId);
    const classroomId = await getContestClassroomId(teacherPage, contestId);
    await addClassroomStudentMembers(teacherPage, classroomId);
    const studentUserId = await resetSeedStudentParticipantIfPresent(teacherPage, contestId);

    await studentPageA.goto("/", { waitUntil: "domcontentloaded" });
    await studentPageA.evaluate(
      ([k, v]) => {
        localStorage.setItem(k, v);
      },
      [DEVICE_KEY, deviceA] as [string, string],
    );
    await loginViaAPI(studentPageA, "student");
    await prepareStudentPaperExamInProgress(studentPageA, teacherPage, contestId);

    const studentPageB = await studentCtxB.newPage();
    const loginResp = await studentPageB.request.post(API_ENDPOINTS.auth.login, {
      data: {
        email: TEST_USERS.student.email,
        password: TEST_USERS.student.password,
      },
    });
    expect(loginResp.status()).toBe(403);
    const body = (await loginResp.json()) as { code?: string; success?: boolean };
    expect(body.success).not.toBe(true);
    expect(body.code).toBe("EXAM_LOGIN_BLOCKED");

    if (studentUserId != null) {
      const token = await teacherPage.evaluate(() => localStorage.getItem("token"));
      await teacherPage.request
        .patch(`/api/v1/contests/${contestId}/update_participant/`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          data: { user_id: studentUserId, exam_status: "not_started" },
        })
        .catch(() => null);
    }

    await studentPageB.close();
    await studentPageA.close();
    await teacherPage.close();
    await studentCtxB.close();
    await studentCtxA.close();
    await teacherCtx.close();
  });
});
