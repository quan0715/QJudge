/**
 * 教室詳情 → CreateContestModal：建立紙本測驗與程式競賽。
 * 需 docker test stack + seed_e2e_data（teacher）。
 */
import { expect, test } from "@playwright/test";
import { clearAuth, loginViaAPI } from "../helpers/auth.helper";
import { clickCreateContestModalPrimary } from "../helpers/exam-lifecycle.helper";

async function createClassroomAndOpen(page: import("@playwright/test").Page): Promise<void> {
  const name = `e2e-contest-class-${Date.now()}`;
  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard-create-menu")).toBeVisible({ timeout: 15000 });
  await page.getByTestId("dashboard-create-menu").click();
  await page.getByTestId("dashboard-create-classroom").click();
  await expect(page.getByTestId("create-classroom-name")).toBeVisible();
  await page.locator("#classroom-name").fill(name);
  await page.locator("#classroom-description").fill("e2e contest create");
  const createClassroomBtn = page
    .getByTestId("create-classroom-modal")
    .getByRole("button")
    .filter({ has: page.getByTestId("create-classroom-submit") });
  const createClassroomResp = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      res.url().includes("/api/v1/classrooms/") &&
      !res.url().includes("/join/"),
    { timeout: 20000 },
  );
  await createClassroomBtn.click();
  const created = await createClassroomResp;
  expect(created.ok(), await created.text().catch(() => "")).toBeTruthy();
  await expect(page).toHaveURL(/\/classrooms\/[0-9a-f-]+/i, { timeout: 20000 });
}

test.describe("Contest create E2E", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await clearAuth(page);
    await loginViaAPI(page, "teacher");
  });

  test("create paper exam (bound to classroom)", async ({ page }) => {
    await createClassroomAndOpen(page);

    await page.getByTestId("classroom-create-contest-btn").click();
    await expect(page.getByTestId("create-contest-modal")).toBeVisible({ timeout: 10000 });

    await page.getByTestId("create-contest-type-exam").click();
    await clickCreateContestModalPrimary(page);

    await expect(page.getByTestId("create-contest-name")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("create-contest-name").fill(`e2e-paper-${Date.now()}`);
    await clickCreateContestModalPrimary(page);

    const postContest = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        /\/api\/v1\/classrooms\/[0-9a-f-]+\/contests\/?(\?|$)/i.test(res.url()),
      { timeout: 25000 },
    );
    await clickCreateContestModalPrimary(page);
    const post = await postContest;
    expect(post.ok(), await post.text().catch(() => "")).toBeTruthy();

    await expect(page).toHaveURL(/\/contest\/[0-9a-f-]+\/admin/i, { timeout: 25000 });
  });

  test("create coding contest (bound to classroom)", async ({ page }) => {
    await createClassroomAndOpen(page);

    await page.getByTestId("classroom-create-contest-btn").click();
    await expect(page.getByTestId("create-contest-modal")).toBeVisible({ timeout: 10000 });

    await page.getByTestId("create-contest-type-coding").click();
    await clickCreateContestModalPrimary(page);

    await expect(page.getByTestId("create-contest-name")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("create-contest-name").fill(`e2e-coding-${Date.now()}`);
    await clickCreateContestModalPrimary(page);

    const postContest = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        /\/api\/v1\/classrooms\/[0-9a-f-]+\/contests\/?(\?|$)/i.test(res.url()),
      { timeout: 25000 },
    );
    await clickCreateContestModalPrimary(page);
    const post = await postContest;
    expect(post.ok(), await post.text().catch(() => "")).toBeTruthy();

    await expect(page).toHaveURL(/\/contest\/[0-9a-f-]+\/admin/i, { timeout: 25000 });
  });
});
