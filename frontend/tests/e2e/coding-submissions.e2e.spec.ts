import { expect, test, type APIResponse, type Page } from "@playwright/test";
import { TEST_USERS } from "../helpers/data.helper";

const SOLUTION = '#include <iostream>\nint main() { long long a, b; std::cin >> a >> b; std::cout << a + b << "\\n"; }';

async function json(response: APIResponse) {
  expect(response.ok(), `${response.url()}: ${response.status()} ${await response.text()}`).toBeTruthy();
  return response.json();
}

// Monaco follows the configured browser user agent, which can differ from the host OS.
async function enterCode(page: Page, code: string) {
  await expect(page.getByRole("textbox", { name: /Editor content/ })).toBeAttached();
  await page.locator(".editor-content__editor").click({ position: { x: 150, y: 20 } });
  const modifier = await page.evaluate(() => /Macintosh/.test(navigator.userAgent) ? "Meta" : "Control");
  await page.keyboard.press(`${modifier}+a`);
  await page.keyboard.press("Backspace");
  await expect(page.locator(".editor-content__editor")).not.toContainText("#include");
  await page.keyboard.insertText(code);
}

test("coding exam: sample run, custom input run, and formal submission use the real judge", async ({ page, playwright }, testInfo) => {
  test.setTimeout(180_000);
  let teacher = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
  let classroomId: string | undefined;
  let contestId: string | undefined;
  try {
    await json(await teacher.post("/api/v1/auth/login/password", {
      data: { identifier: TEST_USERS.teacher.email, password: TEST_USERS.teacher.password },
    }));
    const state = await teacher.storageState();
    const csrf = state.cookies.find(cookie => cookie.name === "csrftoken")?.value;
    expect(csrf).toBeTruthy();
    await teacher.dispose();
    teacher = await playwright.request.newContext({
      baseURL: testInfo.project.use.baseURL,
      storageState: state,
      extraHTTPHeaders: { "X-CSRFToken": csrf! },
    });
    const classroom = await json(await teacher.post("/api/v1/classrooms/", {
      data: { name: `Coding judge E2E ${testInfo.testId}-${testInfo.retry}-${Date.now()}` },
    }));
    classroomId = classroom.uuid;
    await json(await teacher.post(`/api/v1/classrooms/${classroomId}/members/`, {
      data: { usernames: [TEST_USERS.student.username], role: "student" },
    }));
    const bound = await json(await teacher.post(`/api/v1/classrooms/${classroomId}/contests/`, {
      data: { name: "Coding submission E2E", contest_type: "coding", cheat_detection_enabled: false },
    }));
    contestId = bound.contest_id;
    expect(contestId).toBeTruthy();
    const problem = await json(await teacher.post(`/api/v1/contests/${contestId}/problems/`, {
      data: {
        title: "Sum two integers", description: "Read two integers and print their sum.",
        time_limit: 1000, memory_limit: 256,
        language_configs: [{ language: "cpp", is_enabled: true, template_code: "", order: 0 }],
        test_cases: [
          { input_data: "1 2\n", output_data: "3\n", is_sample: true, is_hidden: false, weight_percent: 50, order: 0 },
          { input_data: "100000 -42\n", output_data: "99958\n", is_sample: false, is_hidden: true, weight_percent: 50, order: 1 },
        ],
      },
    }));
    await json(await teacher.patch(`/api/v1/contests/${contestId}/`, {
      data: { status: "published", start_time: new Date(Date.now() - 60_000).toISOString(), end_time: new Date(Date.now() + 3600_000).toISOString() },
    }));

    await test.step("Student logs in and starts the coding exam", async () => {
      await page.goto("/login");
      await page.getByTestId("auth-login-email").fill(TEST_USERS.student.email);
      await page.getByTestId("auth-login-password").fill(TEST_USERS.student.password);
      await page.getByTestId("auth-login-submit").click();
      await expect(page).not.toHaveURL(/\/login/);
      await page.goto(`/classrooms/${classroomId}/contest/${contestId}`);
      await page.getByRole("button", { name: "開始作答", exact: true }).click();
      await expect(page).toHaveURL(/\/solve/);
      await expect(page.getByRole("heading", { name: "Sum two integers", exact: true })).toBeVisible();
      await enterCode(page, SOLUTION);
    });

    const submissions = async () => json(await page.request.get(`/api/v1/submissions/?contest=${contestId}&problem=${problem.id}`));
    expect((await submissions()).count).toBe(0);

    await test.step("Run the public sample without creating a formal submission", async () => {
      const request = page.waitForResponse(r => r.request().method() === "POST" && r.url().includes("/test_run/"), { timeout: 15_000 });
      await page.getByRole("button", { name: "測試", exact: true }).click();
      const runResponse = await request;
      expect(runResponse.status()).toBe(202);
      expect(runResponse.request().postDataJSON()).toMatchObject({ code: SOLUTION, asynchronous: true, contest_id: contestId, custom_test_cases: [] });
      const run = await json(runResponse);
      expect(run.run_id).toBeTruthy();
      const complete = await page.waitForResponse(async response =>
        response.url().includes("/test_run_status/") &&
        (!response.ok() || (await response.json()).execution_status === "complete"),
        { timeout: 90_000 });
      const sampleResult = await json(complete);
      expect(sampleResult.status).toBe("AC");
      expect(sampleResult.results).toHaveLength(1);
      expect(sampleResult.results[0]).toMatchObject({ input: "1 2\n", output: "3", is_hidden: false });
      await expect(page.getByText("1 / 1 Passed", { exact: true })).toBeVisible({ timeout: 90_000 });
      expect((await submissions()).count).toBe(0);
    });

    await test.step("Add custom input and verify its actual output", async () => {
      await page.getByRole("button", { name: "編輯測資", exact: true }).click();
      await page.getByRole("button", { name: "新增測資", exact: true }).click();
      await page.getByRole("textbox", { name: "Input", exact: true }).fill("12345 6789\n");
      await page.getByRole("textbox", { name: "Expected Output", exact: true }).fill("19134\n");
      const request = page.waitForResponse(r => r.request().method() === "POST" && r.url().includes("/test_run/"), { timeout: 15_000 });
      await page.getByRole("button", { name: "測試", exact: true }).click();
      const response = await request;
      expect(response.status()).toBe(202);
      expect(response.request().postDataJSON()).toMatchObject({
        code: SOLUTION, custom_test_cases: [{ input: "12345 6789\n", expected_output: "19134\n" }],
      });
      await json(response);
      const complete = await page.waitForResponse(async response =>
        response.url().includes("/test_run_status/") &&
        (!response.ok() || (await response.json()).execution_status === "complete"),
        { timeout: 90_000 });
      const customResult = await json(complete);
      expect(customResult.status).toBe("AC");
      expect(customResult.results).toHaveLength(2);
      expect(customResult.results[1]).toMatchObject({ input: "12345 6789\n", output: "19134", status: "AC" });
      await expect(page.getByText("2 / 2 Passed", { exact: true })).toBeVisible({ timeout: 90_000 });
      expect((await submissions()).count).toBe(0);
    });

    await test.step("Submit against public and hidden cases, then reopen the saved record", async () => {
      const response = page.waitForResponse(r => r.request().method() === "POST" && /\/submissions\/$/.test(new URL(r.url()).pathname));
      await page.getByRole("button", { name: "繳交", exact: true }).click();
      const submitted = await json(await response);
      expect(submitted.id).toBeTruthy();
      await expect(page.getByText("Score: 100", { exact: true })).toBeVisible({ timeout: 90_000 });
      const detail = await json(await page.request.get(`/api/v1/submissions/${submitted.id}/`));
      expect(detail.total_test_cases).toBe(2);
      expect(detail.results).toHaveLength(2);
      expect(detail.results.filter((result: { is_hidden: boolean }) => result.is_hidden)).toHaveLength(1);
      expect(detail.results.every((result: { status: string }) => result.status === "AC")).toBe(true);
      const records = await submissions();
      expect(records.count).toBe(1);
      expect(records.results[0]).toMatchObject({ id: submitted.id, status: "AC", score: 100 });
      await page.getByRole("button", { name: "繳交記錄", exact: true }).click();
      await expect(page.getByRole("cell", { name: "AC", exact: true })).toHaveCount(1);
      await page.getByRole("cell", { name: "AC", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "繳交詳情" })).toBeVisible();
      await page.keyboard.press("Escape");
      await page.reload();
      await page.getByRole("button", { name: "繳交記錄", exact: true }).click();
      await expect(page.getByRole("cell", { name: "AC", exact: true })).toHaveCount(1);
      await testInfo.attach("persisted-submission", { body: await page.screenshot(), contentType: "image/png" });
    });
  } finally {
    // Delete only fixtures created by this attempt, including on retries/failures.
    for (const path of [contestId && `/api/v1/contests/${contestId}/`, classroomId && `/api/v1/classrooms/${classroomId}/`]) {
      if (!path) continue;
      const response = await teacher.delete(path);
      expect.soft(response.ok(), `cleanup ${path}: ${await response.text()}`).toBeTruthy();
    }
    await teacher.dispose();
  }
});
