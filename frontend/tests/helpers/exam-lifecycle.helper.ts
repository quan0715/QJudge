import { expect, type Page } from "@playwright/test";
import { API_ENDPOINTS, TEST_USERS } from "./data.helper";

const DEVICE_ID_STORAGE_KEY = "qjudge.device_id.v1";

/** 與 `http.client` 一致，確保 Playwright `page.request` 與瀏覽器 axios 使用同一 X-Device-Id（避免 exam start 用 unknown-device、作答頁請求 409）。 */
export async function ensureClientDeviceId(page: Page): Promise<string> {
  return await page.evaluate((key) => {
    let id = localStorage.getItem(key);
    if (!id) {
      id =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(key, id);
    }
    return id;
  }, DEVICE_ID_STORAGE_KEY);
}

export async function authHeaders(page: Page): Promise<Record<string, string>> {
  const token = await page.evaluate(() => localStorage.getItem("token"));
  expect(token).toBeTruthy();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function authHeadersWithDevice(page: Page): Promise<Record<string, string>> {
  const base = await authHeaders(page);
  const deviceId = await ensureClientDeviceId(page);
  return { ...base, "X-Device-Id": deviceId };
}

export async function getContestExamStatus(page: Page, contestId: string): Promise<string | undefined> {
  const headers = await authHeaders(page);
  const resp = await page.request.get(API_ENDPOINTS.contests.detail(contestId), { headers });
  expect(resp.ok()).toBeTruthy();
  const data = await resp.json();
  return data?.exam_status;
}

export async function getMyUserId(page: Page): Promise<string> {
  const headers = await authHeaders(page);
  const resp = await page.request.get(API_ENDPOINTS.users.me, { headers });
  expect(resp.ok()).toBeTruthy();
  const data = await resp.json();
  const id = data?.data?.id ?? data?.id;
  expect(id).toBeTruthy();
  return String(id);
}

/** 發布競賽並設定為「已開考、尚未結束」視窗（與 exam-anticheat 一致）。 */
export async function ensureContestPublishedWithWindow(
  teacherPage: Page,
  contestId: string,
): Promise<void> {
  const headers = await authHeaders(teacherPage);
  const now = Date.now();
  const startAt = new Date(now - 60 * 60 * 1000).toISOString();
  const endAt = new Date(now + 6 * 60 * 60 * 1000).toISOString();
  const resp = await teacherPage.request.patch(API_ENDPOINTS.contests.detail(contestId), {
    headers,
    data: {
      status: "published",
      start_time: startAt,
      end_time: endAt,
    },
  });
  expect(resp.ok(), await resp.text().catch(() => "")).toBeTruthy();
}

export async function addClassroomStudentMembers(
  teacherPage: Page,
  classroomId: string,
  usernames: string[] = [TEST_USERS.student.username],
): Promise<void> {
  const headers = await authHeaders(teacherPage);
  const resp = await teacherPage.request.post(`/api/v1/classrooms/${classroomId}/add_members/`, {
    headers,
    data: { usernames, role: "student" },
  });
  expect(resp.ok(), await resp.text().catch(() => "")).toBeTruthy();
}

async function clearActiveSession(
  teacherPage: Page,
  contestId: string,
  userId: string,
  teacherHeaders: Record<string, string>,
): Promise<void> {
  await teacherPage.request
    .post(`/api/v1/contests/${contestId}/exam/active-sessions/clear/`, {
      headers: teacherHeaders,
      data: { user_id: Number(userId) },
    })
    .catch(() => null);
}

/** 無防弊／紙本測驗：註冊、解鎖後開始作答。 */
export async function prepareStudentPaperExamInProgress(
  studentPage: Page,
  teacherPage: Page,
  contestId: string,
): Promise<void> {
  const headers = await authHeadersWithDevice(studentPage);
  const teacherHeaders = await authHeaders(teacherPage);
  const userId = await getMyUserId(studentPage);

  const regResp = await studentPage.request.post(API_ENDPOINTS.contests.register(contestId), {
    headers,
  });
  expect([200, 201, 400, 403]).toContain(regResp.status());

  await clearActiveSession(teacherPage, contestId, userId, teacherHeaders);
  await teacherPage.request
    .post(`/api/v1/contests/${contestId}/reopen_exam/`, {
      headers: teacherHeaders,
      data: { user_id: Number(userId) },
    })
    .catch(() => null);
  await teacherPage.request
    .post(`/api/v1/contests/${contestId}/unlock_participant/`, {
      headers: teacherHeaders,
      data: { user_id: Number(userId) },
    })
    .catch(() => null);
  await clearActiveSession(teacherPage, contestId, userId, teacherHeaders);

  let ready = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    await studentPage.request.post(API_ENDPOINTS.contests.examStart(contestId), { headers });
    const status = await getContestExamStatus(studentPage, contestId);
    if (status === "in_progress") {
      ready = true;
      break;
    }
    await clearActiveSession(teacherPage, contestId, userId, teacherHeaders);
    await teacherPage.request
      .post(`/api/v1/contests/${contestId}/unlock_participant/`, {
        headers: teacherHeaders,
        data: { user_id: Number(userId) },
      })
      .catch(() => null);
    await studentPage.waitForTimeout(400);
  }
  expect(ready, "student exam_status should become in_progress").toBeTruthy();
  // 保留 active session：最後再 clear 會讓部分環境下後續 GET exam-questions 與頁面載入不一致。
}

/** 與 exam-anticheat 相同：填第一題（選擇／文字／選項）。 */
export async function answerFirstPaperQuestion(studentPage: Page): Promise<void> {
  await studentPage
    .getByText("作答區")
    .first()
    .waitFor({ state: "visible", timeout: 15000 })
    .catch(() => {});

  const optionLabel = studentPage.getByText(/^[A-D]\.\s/).first();
  if (await optionLabel.isVisible().catch(() => false)) {
    await optionLabel.click();
    return;
  }

  const textInputs = studentPage.locator("[data-testid^='exam-answer-input-']");
  for (let i = 0; i < (await textInputs.count()); i++) {
    const input = textInputs.nth(i);
    if (await input.isVisible()) {
      await input.fill("E2E lifecycle short answer");
      await input.blur();
      return;
    }
  }

  const options = studentPage.locator("[data-testid^='exam-answer-option-']");
  for (let i = 0; i < (await options.count()); i++) {
    const option = options.nth(i);
    if (await option.isVisible()) {
      await option.click();
      return;
    }
  }

  const radios = studentPage.getByRole("radio");
  if ((await radios.count()) > 0) {
    await radios.first().click({ force: true });
  }
}

export async function submitPaperExamFromAnswering(studentPage: Page, contestId: string): Promise<void> {
  const openSubmit = studentPage.getByTestId("paper-exam-open-submit-review-btn");
  await expect(openSubmit).toBeVisible({ timeout: 15000 });
  await openSubmit.click();

  const submitReviewModal = studentPage.getByTestId("paper-exam-submit-review-modal");
  await expect(submitReviewModal).toBeVisible({ timeout: 15000 });

  const submitConfirmBtn = studentPage
    .getByTestId("paper-exam-submit-confirm-btn")
    .locator("xpath=ancestor::button[1]");
  await expect(submitConfirmBtn).toBeVisible({ timeout: 10000 });
  await submitConfirmBtn.click();

  await studentPage.waitForURL(new RegExp(`/classrooms/[^/]+/contest/${contestId}(/)?(\\?.*)?$`), {
    timeout: 25000,
  });
}

/** CreateContestModal：主按鈕（下一步 / 建立）。以 dialog 為範圍，避免 data-testid 節點未包住 footer。 */
export async function clickCreateContestModalPrimary(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const primary = dialog.locator("button.cds--btn--primary").last();
  await expect(primary).toBeEnabled({ timeout: 8000 });
  await primary.click();
}
