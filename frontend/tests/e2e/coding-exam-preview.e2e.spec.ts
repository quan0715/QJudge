import { expect, test } from "@playwright/test";

import { loginViaAPI } from "../helpers/auth.helper";
import { findContestIdByName } from "../helpers/contest-editor.helper";
import { getContestClassroomId } from "../helpers/exam-precheck.helper";
import { TEST_CONTESTS } from "../helpers/data.helper";

test.describe("Coding exam preview", () => {
  test("student solve page shares selection and can return without ending the exam", async ({ browser }, testInfo) => {
    const teacherContext = await browser.newContext({ storageState: ".auth/teacher.json", baseURL: testInfo.project.use.baseURL });
    const teacherPage = await teacherContext.newPage();
    await teacherPage.goto("/");
    const contestId = await findContestIdByName(teacherPage, TEST_CONTESTS.active.name);
    const classroomId = await getContestClassroomId(teacherPage, contestId);
    await teacherContext.close();
    const studentContext = await browser.newContext({ storageState: ".auth/student.json", baseURL: testInfo.project.use.baseURL });
    const page = await studentContext.newPage();
    await page.goto("/");
    const token = await page.evaluate(() => localStorage.getItem("token"));
    const headers = { Authorization: `Bearer ${token}` };
    const examUrl = `/api/v1/contests/${contestId}/`;
    const initial = await (await page.request.get(examUrl, { headers })).json();
    if (!initial.has_joined) {
      expect((await page.request.post(`${examUrl}register/`, { headers, data: {} })).ok()).toBe(true);
    }
    if (!initial.has_started) {
      expect((await page.request.post(`${examUrl}exam/start/`, { headers })).ok()).toBe(true);
    }
    await page.goto(`/classrooms/${classroomId}/contest/${contestId}/solve`);
    await expect(page.locator(".problem-full-page-solve")).toBeVisible({ timeout: 30000 });
    await expect(page.locator(".solver-layout__menu")).toHaveCount(0);
    await expect(page.locator(".solver-layout__statement-header")).toHaveCount(0);
    await expect(page.locator(".solver-layout__collapsed-bar")).toHaveCount(0);
    const buttons = page.locator(".contest-runtime-problem");
    await expect(buttons).toHaveCount(2);
    await buttons.nth(1).click();
    await expect(buttons.nth(1)).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "Hello World", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "繳交記錄", exact: true }).click();
    await expect(page.getByRole("heading", { name: "我的繳交記錄", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "題目資訊", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Hello World", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("student-single-sidebar.png") });
    const endRequests: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && /end_exam|submit_exam|exit_exam|exam\/end/.test(request.url())) endRequests.push(request.url());
    });
    await page.getByRole("button", { name: "返回競賽主頁", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/classrooms/${classroomId}/contest/${contestId}/?$`));
    expect(endRequests).toEqual([]);
    const after = await (await page.request.get(examUrl, { headers })).json();
    expect(after.exam_status).toBe("in_progress");
    await studentContext.close();
  });

  test("loads each draft and displays colored, translated test results", async ({ page }, testInfo) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await loginViaAPI(page, "teacher");

    const contestId = await findContestIdByName(page, TEST_CONTESTS.active.name);
    const classroomId = await getContestClassroomId(page, contestId);
    await page.goto(
      `/classrooms/${classroomId}/contest/${contestId}/exam-preview`,
      { waitUntil: "domcontentloaded" },
    );

    await expect(page.locator(".problem-full-page-solve")).toBeVisible({ timeout: 30000 });

    const problemButtons = page.locator(".contest-runtime-problem");
    expect(await problemButtons.count()).toBeGreaterThanOrEqual(2);

    const editorSurface = page.locator(".monaco-editor .view-lines");
    await expect(editorSurface).toBeVisible({ timeout: 30000 });

    const firstDraft = "// preview-problem-a-draft";
    await editorSurface.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.insertText(firstDraft);
    await expect(editorSurface).toContainText(firstDraft);

    await page.route("**/test_run/", (route) => route.fulfill({
      json: { results: [
        { case_id: 1, status: "WA", input: "1 2", expected_output: "3", output: "-1", exec_time: 12 },
        { case_id: 2, status: "AC", input: "2 3", expected_output: "5", output: "5", exec_time: 14 },
      ] },
    }));
    const runButton = page.getByRole("button", { name: "測試", exact: true });
    await expect(runButton).toHaveText("測試");
    await runButton.click();
    await expect(page.getByRole("heading", { name: "Test Case #1", exact: true })).toBeVisible();
    await expect(page.getByText("未通過", { exact: true })).toBeVisible();
    const failedCase = page.getByRole("button", { name: /^#1/ });
    const passedCase = page.getByRole("button", { name: /^#2/ });
    for (const [row, token] of [[failedCase, "--cds-support-error"], [passedCase, "--cds-support-success"]] as const) {
      expect(await row.locator("svg").evaluate((icon, colorToken) => {
        const probe = document.createElement("span");
        probe.style.color = `var(${colorToken})`;
        icon.parentElement!.appendChild(probe);
        const expected = getComputedStyle(probe).color;
        probe.remove();
        return getComputedStyle(icon).fill === expected;
      }, token)).toBe(true);
    }
    await page.screenshot({ path: testInfo.outputPath("test-results-status.png") });

    await expect(problemButtons.nth(0)).toHaveAttribute("data-solved", "false");
    await page.route("**/api/v1/submissions/", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      return route.fulfill({ json: { id: 99999, status: "AC", score: 100, results: [] } });
    });
    await page.getByRole("button", { name: "繳交", exact: true }).click();
    await expect(problemButtons.nth(0)).toHaveAttribute("data-solved", "true");
    await expect(problemButtons.nth(0)).toHaveAttribute("data-status", "done");
    expect(await problemButtons.nth(0).evaluate((button) => {
      const icon = button.querySelector("svg")!;
      return getComputedStyle(icon).fill === getComputedStyle(button).color;
    })).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("selected-accepted-problem.png") });

    await problemButtons.nth(1).click();
    await expect(editorSurface).not.toContainText(firstDraft);
    const solvedColor = await problemButtons.nth(0).evaluate((button) => getComputedStyle(button).color);
    const selectedColor = await problemButtons.nth(1).evaluate((button) => getComputedStyle(button).color);
    expect(solvedColor).not.toBe(selectedColor);
    await page.screenshot({ path: testInfo.outputPath("preview-accepted-problem.png") });

    await problemButtons.nth(0).click();
    await expect(editorSurface).toContainText(firstDraft);
  });

  test("uses one collapsible sidebar and returns to the same contest", async ({ page }, testInfo) => {
    await page.goto("/");
    await loginViaAPI(page, "teacher");
    const contestId = await findContestIdByName(page, TEST_CONTESTS.active.name);
    const classroomId = await getContestClassroomId(page, contestId);
    await page.goto(`/classrooms/${classroomId}/contest/${contestId}/exam-preview`);
    await expect(page.locator(".problem-full-page-solve")).toBeVisible({ timeout: 30000 });
    await expect(page.locator(".solver-layout__menu")).toHaveCount(0);
    await expect(page.getByText("預覽模式", { exact: true })).toBeVisible();
    const buttons = page.locator(".contest-runtime-problem");
    await expect(buttons).toHaveCount(2);
    await buttons.nth(1).click();
    await expect(buttons.nth(1)).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "Hello World", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "收合側欄", exact: true }).click();
    await expect(page.getByRole("button", { name: "展開側欄", exact: true })).toBeVisible();
    await expect(buttons.nth(0)).toHaveText("A");
    await expect(buttons.nth(1)).toHaveText("B");
    await page.getByRole("button", { name: "繳交記錄", exact: true }).click();
    await expect(page.getByRole("heading", { name: "我的繳交記錄", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "關閉資訊面板", exact: true }).click();
    await expect(page.locator(".solver-layout__statement")).toBeHidden();
    await page.getByRole("button", { name: "題目資訊", exact: true }).click();
    await buttons.nth(0).click();
    await expect(page.getByRole("heading", { name: "A+B Problem", exact: true })).toBeVisible();
    await expect.poll(() => buttons.nth(0).evaluate((button) => button.getBoundingClientRect().width)).toBeLessThanOrEqual(48);
    await expect(page.locator(".monaco-editor .view-lines")).toBeVisible();
    const historyButton = page.getByRole("button", { name: "繳交記錄", exact: true });
    await historyButton.hover();
    const tooltip = page.getByRole("tooltip").filter({ hasText: "繳交記錄" });
    await expect(tooltip).toBeVisible();
    const triggerBox = (await historyButton.boundingBox())!;
    const tooltipBox = (await tooltip.getByText("繳交記錄", { exact: true }).boundingBox())!;
    expect(tooltipBox.x).toBeGreaterThanOrEqual(triggerBox.x + triggerBox.width);
    await page.screenshot({ path: testInfo.outputPath("single-sidebar-collapsed.png") });
    await page.getByRole("button", { name: "展開側欄", exact: true }).click();
    await expect.poll(() => buttons.nth(0).evaluate((button) => button.getBoundingClientRect().width)).toBeGreaterThan(200);
    await page.screenshot({ path: testInfo.outputPath("single-sidebar-expanded.png") });
    const endRequests: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && /end_exam|submit_exam|exit_exam|exam\/end/.test(request.url())) endRequests.push(request.url());
    });
    await page.getByRole("button", { name: "返回競賽主頁", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/classrooms/${classroomId}/contest/${contestId}/?$`));
    expect(endRequests).toEqual([]);
  });
});

test("test run shows all pending cases and updates real progress", async ({ page }, testInfo) => {
  await page.goto("/");
  await loginViaAPI(page, "teacher");
  const id = await findContestIdByName(page, TEST_CONTESTS.active.name);
  const classroom = await getContestClassroomId(page, id);
  await page.goto(`/classrooms/${classroom}/contest/${id}/exam-preview`);
  await expect(page.locator(".monaco-editor .view-lines")).toBeVisible({ timeout: 30000 });
  await page.route("**/test_run/", route => route.fulfill({ status: 202, json: {
    run_id: "progress-test", execution_status: "pending", status: "pending", total: 4, results: [],
  } }));
  let finish = false;
  await page.route("**/test_run_status/?**", route => route.fulfill({ json: {
    execution_status: finish ? "complete" : "judging", total: 4, status: finish ? "AC" : "pending",
    results: Array.from({ length: finish ? 4 : 1 }, (_, index) => ({ case_id: index + 1,
      status: "AC", input: "1 2", expected_output: "3", output: "3", exec_time: 12,
    })),
  } }));
  await page.getByRole("button", { name: "測試", exact: true }).click();
  await expect(page.getByRole("button", { name: /^#4/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^#1/ })).toContainText("12ms", { timeout: 10000 });
  await expect(page.getByRole("button", { name: /^#4/ })).not.toContainText("12ms");
  await page.screenshot({ path: testInfo.outputPath("test-run-progress.png") });
  finish = true;
  await expect(page.getByRole("button", { name: /^#4/ })).toContainText("12ms", { timeout: 10000 });
  await expect(page.getByRole("button", { name: "測試", exact: true })).toBeEnabled();
});
