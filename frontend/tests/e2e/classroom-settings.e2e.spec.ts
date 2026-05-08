/**
 * E2E: classroom create → settings (icon + preset cover + optional file upload) → rename → delete.
 * Requires docker test stack + seed_e2e_data (teacher@example.com).
 *
 * Locators: data-testid plus stable field `#id` for Carbon inputs (fill targets the real control).
 * File POST to upload_cover needs S3-compatible object storage; opt in with E2E_RUN_COVER_UPLOAD=1 (default: skipped).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";
import { clearAuth, loginViaAPI } from "../helpers/auth.helper";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PNG = path.join(__dirname, "fixtures", "e2e-1x1.png");

test.describe("Classroom settings E2E", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await clearAuth(page);
    await loginViaAPI(page, "teacher");
  });

  test("create, edit icon and preset cover, rename, file upload, delete", async ({ page }) => {
    const name = `e2e-classroom-${Date.now()}`;
    const renamed = `${name}-renamed`;

    await page.goto("/dashboard");
    await expect(page.getByTestId("dashboard-create-menu")).toBeVisible({ timeout: 15000 });

    await page.getByTestId("dashboard-create-menu").click();
    await page.getByTestId("dashboard-create-classroom").click();

    await expect(page.getByTestId("create-classroom-name")).toBeVisible();
    // Fill by #id: Carbon may attach data-testid to a wrapper; controlled inputs need real input events on the field.
    await page.locator("#classroom-name").fill(name);
    await page.locator("#classroom-description").fill("e2e description");
    const createClassroomBtn = page
      .getByTestId("create-classroom-modal")
      .getByRole("button")
      .filter({ has: page.getByTestId("create-classroom-submit") });
    await expect(createClassroomBtn).toBeEnabled({ timeout: 5000 });

    const createClassroomResp = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/v1/classrooms/") &&
        !res.url().includes("/join/"),
      { timeout: 20000 },
    );
    await createClassroomBtn.click();
    const created = await createClassroomResp;
    expect(
      created.ok(),
      created.ok() ? "" : await created.text().catch(() => "(empty body)"),
    ).toBeTruthy();

    await expect(page).toHaveURL(/\/classrooms\/[0-9a-f-]+/i, { timeout: 20000 });
    const classroomId = page.url().match(/\/classrooms\/([^/?#]+)/)?.[1];
    expect(classroomId).toBeTruthy();

    await page.getByTestId("classroom-open-settings").click();
    await expect(page.getByTestId("classroom-settings-name")).toBeVisible({ timeout: 15000 });

    const iconPatch = page.waitForResponse(
      (res) =>
        res.request().method() === "PATCH" &&
        res.url().includes(`/api/v1/classrooms/${classroomId}/`) &&
        !res.url().includes("upload_cover") &&
        res.ok(),
    );
    await page.getByTestId("classroom-icon-book").click();
    await iconPatch;

    const presetCoverPatch = page.waitForResponse(
      (res) =>
        res.request().method() === "PATCH" &&
        res.url().includes(`/api/v1/classrooms/${classroomId}/`) &&
        res.ok(),
    );
    await page.getByTestId("classroom-cover-edit-trigger").click();
    await expect(page.getByTestId("image-edit-dialog")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("image-edit-gallery-0")).toBeVisible({ timeout: 5000 });
    await page.getByTestId("image-edit-gallery-0").click();
    await presetCoverPatch;
    // Cover PATCH triggers onRefresh; wait until UI/sync settles so rename isn't overwritten by useEffect.
    await expect(page.getByTestId("image-edit-dialog")).not.toBeVisible({ timeout: 10000 });
    await expect(page.locator("#classroom-settings-name")).toHaveValue(name, { timeout: 15000 });

    const renamePatch = page.waitForResponse(
      (res) =>
        res.request().method() === "PATCH" &&
        res.url().includes(`/api/v1/classrooms/${classroomId}/`) &&
        !res.url().includes("upload_cover"),
      { timeout: 30000 },
    );
    await page.locator("#classroom-settings-name").fill(renamed);
    await page.locator("#classroom-settings-name").press("Tab");
    const renameResp = await renamePatch;
    expect(
      renameResp.ok(),
      renameResp.ok() ? "" : await renameResp.text().catch(() => "(empty body)"),
    ).toBeTruthy();

    if (process.env.E2E_RUN_COVER_UPLOAD === "1") {
      const uploadResp = page.waitForResponse(
        (res) =>
          res.request().method() === "POST" &&
          res.url().includes("upload_cover"),
        { timeout: 60000 },
      );
      await page.getByTestId("classroom-cover-edit-trigger").click();
      await expect(page.getByTestId("image-edit-dialog")).toBeVisible({ timeout: 5000 });
      await page.getByTestId("image-edit-tab-upload").click();
      await page.getByTestId("classroom-cover-file-input").setInputFiles(FIXTURE_PNG);
      const uploadRes = await uploadResp;
      expect(
        uploadRes.ok(),
        uploadRes.ok() ? "" : await uploadRes.text().catch(() => "(empty body)"),
      ).toBeTruthy();
    }

    await page.getByTestId("classroom-settings-open-delete").click();
    await expect(page.getByTestId("classroom-delete-confirm-modal")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("classroom-delete-confirm-marker")).toBeVisible();
    await page
      .getByTestId("classroom-delete-confirm-modal")
      .getByRole("button")
      .filter({ has: page.getByTestId("classroom-delete-submit") })
      .click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });
  });
});
