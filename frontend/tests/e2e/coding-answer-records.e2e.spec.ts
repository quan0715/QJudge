import { expect, test } from "@playwright/test";
import { loginViaAPI } from "../helpers/auth.helper";
import { findContestIdByName } from "../helpers/contest-editor.helper";
import { getContestClassroomId } from "../helpers/exam-precheck.helper";
import { TEST_CONTESTS } from "../helpers/data.helper";

test("coding answer records show scores and expandable history", async ({ page }, testInfo) => {
  await page.goto("/");
  await loginViaAPI(page, "teacher");
  const id = await findContestIdByName(page, TEST_CONTESTS.active.name);
  const classroom = await getContestClassroomId(page, id);
  await page.route(`**/api/v1/contests/${id}/`, async route => {
    const response = await route.fetch();
    const data = await response.json();
    data.has_joined = true;
    data.has_started = true;
    data.exam_status = "in_progress";
    data.problems = data.problems.map((p: object, index: number) => ({ ...p,
      user_status: index ? "WA" : "AC", user_score: index ? 60 : 100,
      submission_count: index ? 2 : 3,
    }));
    await route.fulfill({ response, json: data });
  });
  await page.route("**/api/v1/submissions/?**", route => route.fulfill({ json: {
    count: 2, results: [60, 30].map((score, index) => ({
      id: 90001 + index, language: "cpp", status: "WA", score, exec_time: 12,
      created_at: "2026-09-07T00:00:00Z",
    })),
  } }));
  await page.goto(`/classrooms/${classroom}/contest/${id}`);
  await page.getByRole("tab", { name: /作答紀錄/ }).click();
  const summary = page.getByRole("button", { name: /60.*100.*WA/ });
  await expect(summary).toBeVisible();
  await expect(page.getByRole("tabpanel").filter({ has: summary })).not.toContainText("待發布");
  const columns = page.locator('[class*="_columns_"] > span');
  const cells = summary.locator('[class*="_summary_"] > *');
  for (let index = 0; index < 4; index++) {
    const header = (await columns.nth(index).boundingBox())!;
    const cell = (await cells.nth(index).boundingBox())!;
    expect(Math.abs(header.x - cell.x)).toBeLessThan(2);
  }
  expect((await cells.nth(2).boundingBox())!.width).toBeLessThan(100);
  await summary.click();
  await expect(page.getByRole("heading", { name: "我的繳交記錄" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "WA", exact: true })).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath("coding-records-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  await expect(summary).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("coding-records-mobile.png"), fullPage: true });
});
