/**
 * 教室 → 建立紙本測驗（關閉防弊略過 precheck）→ 手動出題 → 發布/時段
 * → 學生作答交卷 → 教師批改。
 *
 * 需 docker test stack + seed_e2e_data。
 */
import { expect, test } from "@playwright/test";
import { loginViaAPI } from "../helpers/auth.helper";
import { API_ENDPOINTS } from "../helpers/data.helper";
import {
  addClassroomStudentMembers,
  answerFirstPaperQuestion,
  authHeaders,
  authHeadersWithDevice,
  clickCreateContestModalPrimary,
  ensureContestPublishedWithWindow,
  getContestExamStatus,
  getMyUserId,
  prepareStudentPaperExamInProgress,
  submitPaperExamFromAnswering,
} from "../helpers/exam-lifecycle.helper";
import {
  clickPaperExamTypeTile,
  clickQuestionSourceTab,
  openQuestionSourcePanel,
} from "../helpers/contest-editor.helper";

test.describe("Exam full lifecycle E2E", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  test("paper exam: classroom → create contest → question → student submits → teacher grades", async ({
    browser,
  }) => {
    const teacherPage = await browser.newPage();
    const studentPage = await browser.newPage();

    await teacherPage.goto("/", { waitUntil: "domcontentloaded" });
    await loginViaAPI(teacherPage, "teacher");

    const classBase = `e2e-life-class-${Date.now()}`;
    await teacherPage.goto("/dashboard");
    await expect(teacherPage.getByTestId("dashboard-create-menu")).toBeVisible({ timeout: 15000 });
    await teacherPage.getByTestId("dashboard-create-menu").click();
    await teacherPage.getByTestId("dashboard-create-classroom").click();
    await teacherPage.locator("#classroom-name").fill(classBase);
    await teacherPage.locator("#classroom-description").fill("e2e full lifecycle");
    const createClassroomBtn = teacherPage
      .getByTestId("create-classroom-modal")
      .getByRole("button")
      .filter({ has: teacherPage.getByTestId("create-classroom-submit") });
    const createClassroomResp = teacherPage.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/v1/classrooms/") &&
        !res.url().includes("/join/"),
      { timeout: 20000 },
    );
    await createClassroomBtn.click();
    await createClassroomResp;
    await expect(teacherPage).toHaveURL(/\/classrooms\/[0-9a-f-]+/i, { timeout: 20000 });
    const classroomId = teacherPage.url().match(/\/classrooms\/([^/?#]+)/)?.[1];
    expect(classroomId).toBeTruthy();

    await teacherPage.getByTestId("classroom-create-contest-btn").click();
    await expect(teacherPage.getByTestId("create-contest-modal")).toBeVisible({ timeout: 10000 });
    await teacherPage.getByTestId("create-contest-type-exam").click();
    await clickCreateContestModalPrimary(teacherPage);

    await expect(teacherPage.getByTestId("create-contest-name")).toBeVisible({ timeout: 10000 });
    await teacherPage.getByTestId("create-contest-name").fill(`e2e-life-exam-${Date.now()}`);
    await clickCreateContestModalPrimary(teacherPage);

    // 關閉「考試模式」→ 後端 cheat_detection_enabled 為 false，學生可直接進作答頁。
    await expect(teacherPage.locator("#contest-exam-mode")).toBeVisible({ timeout: 5000 });
    await teacherPage.locator("#contest-exam-mode").click({ force: true });

    const postContest = teacherPage.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        /\/api\/v1\/classrooms\/[0-9a-f-]+\/contests\/?(\?|$)/i.test(res.url()),
      { timeout: 25000 },
    );
    await clickCreateContestModalPrimary(teacherPage);
    const post = await postContest;
    expect(post.ok(), await post.text().catch(() => "")).toBeTruthy();

    await expect(teacherPage).toHaveURL(/\/contest\/[0-9a-f-]+\/admin/i, { timeout: 25000 });
    const contestId = teacherPage.url().match(/\/contest\/([^/?#]+)/)?.[1];
    expect(contestId).toBeTruthy();

    await teacherPage.goto(
      `/classrooms/${classroomId}/contest/${contestId}/admin?panel=problem_editor`,
      { waitUntil: "domcontentloaded" },
    );
    await expect(teacherPage).toHaveURL(/panel=problem_editor/, { timeout: 60000 });
    await openQuestionSourcePanel(teacherPage);
    await clickQuestionSourceTab(teacherPage, "question-source-tab-paper-types");
    await clickPaperExamTypeTile(teacherPage, "short_answer");
    await expect(async () => {
      expect(await teacherPage.locator("[data-question-id]").count()).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 90000 });

    await ensureContestPublishedWithWindow(teacherPage, contestId!);
    await addClassroomStudentMembers(teacherPage, classroomId!);

    await studentPage.goto("/", { waitUntil: "domcontentloaded" });
    await loginViaAPI(studentPage, "student");
    const studentUserId = await getMyUserId(studentPage);

    await prepareStudentPaperExamInProgress(studentPage, teacherPage, contestId!);

    const stHeaders = await authHeadersWithDevice(studentPage);
    await studentPage.request.post(API_ENDPOINTS.contests.examStart(contestId!), { headers: stHeaders });

    await expect
      .poll(async () => {
        const r = await studentPage.request.get(
          `/api/v1/contests/${contestId}/exam-questions/`,
          { headers: stHeaders },
        );
        if (!r.ok()) return -1;
        const body = await r.json();
        return Array.isArray(body) ? body.length : ((body as { results?: unknown[] }).results?.length ?? 0);
      }, { timeout: 60000 })
      .toBeGreaterThanOrEqual(1);

    await studentPage.goto(
      `/classrooms/${classroomId}/contest/${contestId}/solve`,
      { waitUntil: "domcontentloaded" },
    );
    await expect(studentPage).toHaveURL(/\/solve/, { timeout: 30000 });

    await answerFirstPaperQuestion(studentPage);
    await submitPaperExamFromAnswering(studentPage, contestId!);

    await expect
      .poll(async () => getContestExamStatus(studentPage, contestId!), { timeout: 15000 })
      .toBe("submitted");

    await teacherPage.goto(
      `/classrooms/${classroomId}/contest/${contestId}/admin?panel=grading&grading_view=byStudent&grading_student=${studentUserId}`,
      { waitUntil: "domcontentloaded" },
    );
    await expect(teacherPage.getByTestId("grading-score-slider-wrap")).toBeVisible({
      timeout: 60000,
    });

    // 簡答題預設配分常為 5；數字鍵超過 maxScore 不會改分，勿用 "8"。
    await teacherPage.getByTestId("grading-score-slider-wrap").click();
    await teacherPage.keyboard.press("5");
    const gradeResp = teacherPage.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/exam-answers/") &&
        res.url().includes("/grade/"),
      { timeout: 20000 },
    );
    await teacherPage.getByTestId("grading-save-score-btn").click();
    await gradeResp;

    const headers = await authHeaders(teacherPage);
    await expect
      .poll(async () => {
        const r = await teacherPage.request.get(
          `/api/v1/contests/${contestId}/exam-answers/all-answers/`,
          { headers },
        );
        if (!r.ok()) return -1;
        const rows = (await r.json()) as { score?: number | null }[];
        return rows.filter((row) => row.score != null && Number(row.score) > 0).length;
      }, { timeout: 20000 })
      .toBeGreaterThanOrEqual(1);

    await teacherPage.close();
    await studentPage.close();
  });
});
