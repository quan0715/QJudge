import { expect, test } from "@playwright/test";

// Real editor components; every API request stays inside this synthetic browser test.
test.beforeEach(async ({ page }) => {
  const questions = [
    { id: "q1", contest: "fixtures", question_type: "single_choice", prompt: "計算 $2+3$ 的值。", options: ["4", "5"], correct_answer: 1, explanation: "相加得 5。", score: 5, order: 0, answer_format: "plain_text" },
    { id: "q2", contest: "fixtures", question_type: "essay", prompt: "請說明你的推導過程。", options: [], correct_answer: "寫出計算步驟。", explanation: "", score: 10, order: 1, answer_format: "plain_text" },
  ];
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/users/me") return route.fulfill({ json: { data: { id: 1, username: "fixture-teacher", role: "teacher" }, meta: {} } });
    if (path.endsWith("/problems/binding-1/")) return route.fulfill({ json: {
      id: "problem-1", title: "A + B", description: "輸入兩個整數並輸出總和。", difficulty: "easy", time_limit: 1000, memory_limit: 256,
      samples: [{ input: "1 2", output: "3" }], test_cases: [{ input: "1 2", output: "3", is_sample: true, is_hidden: false }], language_configs: [],
    } });
    if (path.endsWith("/exam-paper/")) return route.fulfill({ json: { questions, groups: [] } });
    if (path.endsWith("/exam-questions/q1/") && route.request().method() === "PATCH") {
      Object.assign(questions[0], route.request().postDataJSON());
      return route.fulfill({ json: questions[0] });
    }
    if (path.endsWith("/exam-paper/q1/") && route.request().method() === "PATCH") {
      Object.assign(questions[0], route.request().postDataJSON().question);
      return route.fulfill({ json: { kind: "question", id: "q1", question: questions[0] } });
    }
    if (path.includes("/all-answers/")) return route.fulfill({ json: { data: [], meta: { count: 0, projection: "grading" } } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/tests/browser/fixtures/workbench-editor.html?edit_item=q1");
  await expect(page.getByRole("main", { name: "題目編輯" })).toBeVisible();
});

test("confirms a score policy against the selected contest and refreshes its saved state", async ({ page }) => {
  await page.getByRole("button", { name: "分數政策", exact: true }).click();
  await page.getByRole("menuitem", { name: "設為送分", exact: true }).click();
  const saved = page.waitForRequest((request) => request.method() === "PATCH" && new URL(request.url()).pathname === "/api/v1/contests/fixtures/exam-questions/q1/");
  await page.getByRole("button", { name: "確認套用", exact: true }).click();
  expect((await saved).postDataJSON()).toMatchObject({ score_policy: "full_marks", existing_grades_action: "keep" });
  await expect(page.getByText("送分", { exact: true })).toBeVisible();
});

test("opens the existing coding content, test-case and language controls inside the workbench", async ({ page }, testInfo) => {
  await page.goto("/tests/browser/fixtures/workbench-editor.html?coding=1");
  await expect(page.getByRole("heading", { name: "工作台", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "批改", exact: true })).toHaveCount(0);
  // The rail appears before the asynchronously loaded preview card. Target the
  // card explicitly: selecting the rail item does not open its editor.
  await page.getByRole("button", { name: /^題目 A 程式題 .*A \+ B/ }).click();
  await expect(page.getByRole("tab", { name: "基本資訊", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "題目內容", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "測資與配分", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "配分", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "撰寫設定", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("workbench-coding.png") });
});

test("keeps exports, preview and score policies accessible in the current editor", async ({ page }, testInfo) => {
  await page.getByRole("button", { name: "匯出檔案", exact: true }).click();
  await expect(page.getByLabel("合成操作")).toHaveText("匯出");
  await page.getByRole("button", { name: "預覽學生畫面", exact: true }).click();
  await expect(page.getByLabel("合成操作")).toHaveText("預覽");
  await page.getByRole("button", { name: "分數政策", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "設為不計分" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "設為送分" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "設為配分重分配" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.screenshot({ path: testInfo.outputPath("workbench-editor-light.png") });
});

test("saves a changed answer before switching to the next question", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: "dark" });
  const saved = page.waitForRequest((request) => request.method() === "PATCH" && request.url().includes("/exam-paper/q1/"));
  await page.locator('label[for="answer-q1-0"]').click();
  await page.getByRole("button", { name: /下一題 2/ }).click();
  expect((await saved).postDataJSON().question.correct_answer).toBe(0);
  await expect(page).toHaveURL(/edit_item=q2/);
  await expect(page.getByRole("heading", { name: "評分參考答案" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("workbench-editor-dark.png") });
});
