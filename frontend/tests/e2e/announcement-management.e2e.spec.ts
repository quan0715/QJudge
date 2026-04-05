/**
 * E2E: global announcement CRUD (/management/announcements).
 * Requires admin@example.com (is_staff) from seed_e2e_data.
 *
 * Locators: data-testid plus stable `#id` for Carbon form controls.
 */
import { expect, test } from "@playwright/test";

import { clearAuth, loginViaAPI } from "../helpers/auth.helper";

test.describe("Announcement management E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await clearAuth(page);
    await loginViaAPI(page, "admin");
  });

  test("admin can create, edit, and delete an announcement", async ({ page }) => {
    const title = `e2e-announce-${Date.now()}`;
    const titleEdited = `${title}-edited`;

    await page.goto("/management/announcements");
    await expect(page.getByTestId("announcement-create")).toBeVisible({ timeout: 20000 });

    await page.getByTestId("announcement-create").click();
    await expect(page.getByTestId("announcement-field-title")).toBeVisible();

    await page.locator("#title").fill(title);
    await page.locator("#content").fill("e2e announcement body");
    const editorPrimary = page
      .getByTestId("announcement-editor-modal")
      .getByRole("button")
      .filter({ has: page.getByTestId("announcement-editor-submit") });
    await expect(editorPrimary).toBeEnabled({ timeout: 5000 });

    const createAnn = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/v1/management/announcements/"),
      { timeout: 30000 },
    );
    await editorPrimary.click();
    const createdAnn = await createAnn;
    expect(
      createdAnn.ok(),
      createdAnn.ok() ? "" : await createdAnn.text().catch(() => "(empty body)"),
    ).toBeTruthy();

    const row = page.locator("tbody tr").filter({ hasText: title });
    await expect(row).toBeVisible({ timeout: 15000 });

    await row.locator('[data-testid^="announcement-edit-"]').click();
    await expect(page.getByTestId("announcement-field-title")).toBeVisible();

    const patchAnn = page.waitForResponse(
      (res) =>
        res.request().method() === "PATCH" &&
        res.url().includes("/api/v1/management/announcements/"),
      { timeout: 30000 },
    );
    await page.locator("#title").fill(titleEdited);
    const saveBtn = page
      .getByTestId("announcement-editor-modal")
      .getByRole("button")
      .filter({ has: page.getByTestId("announcement-editor-submit") });
    await expect(saveBtn).toBeEnabled({ timeout: 5000 });
    await saveBtn.click();
    const patchedAnn = await patchAnn;
    expect(
      patchedAnn.ok(),
      patchedAnn.ok() ? "" : await patchedAnn.text().catch(() => "(empty body)"),
    ).toBeTruthy();

    const editedRow = page.locator("tbody tr").filter({ hasText: titleEdited });
    await expect(editedRow).toBeVisible({ timeout: 15000 });

    const deleteAnn = page.waitForResponse(
      (res) =>
        res.request().method() === "DELETE" &&
        res.url().includes("/api/v1/management/announcements/"),
      { timeout: 30000 },
    );
    await editedRow.locator('[data-testid^="announcement-delete-"]').click();
    await expect(page.getByTestId("announcement-delete-modal")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("announcement-delete-marker")).toBeVisible();
    await page
      .getByTestId("announcement-delete-modal")
      .getByRole("button")
      .filter({ has: page.getByTestId("announcement-delete-submit") })
      .click();
    const deletedAnn = await deleteAnn;
    expect(deletedAnn.ok(), `DELETE status ${deletedAnn.status()}`).toBeTruthy();

    await expect(page.locator("tbody tr").filter({ hasText: titleEdited })).toHaveCount(0, {
      timeout: 15000,
    });
  });
});
