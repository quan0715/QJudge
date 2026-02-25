/**
 * E2E Tests for API Key Management
 *
 * Tests the API Key settings page UI flows.
 * Uses route interception to mock backend responses (no real Anthropic key needed).
 */

import { test, expect, Page } from "@playwright/test";
import { login, clearAuth } from "../helpers/auth.helper";

/** Set up route mocks for API key endpoints before navigation. */
async function mockAPIKeyEndpoints(
  page: Page,
  opts: { hasKey: boolean; keyName?: string }
) {
  const keyData = opts.hasKey
    ? {
        has_key: true,
        is_validated: true,
        is_active: true,
        key_name: opts.keyName ?? "Test Key",
        total_requests: 10,
        total_input_tokens: 500,
        total_output_tokens: 200,
        total_cost_usd: 0.02,
        created_at: "2026-01-15T00:00:00Z",
      }
    : { has_key: false };

  // Mock the exact api-key endpoint (not sub-paths like /usage)
  await page.route(
    (url) =>
      url.pathname === "/api/v1/users/me/api-key" &&
      !url.search.includes("usage"),
    (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, data: keyData }),
        });
      }
      return route.continue();
    }
  );

  // Mock usage endpoint
  await page.route("**/api/v1/users/me/api-key/usage*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          total: {
            input_tokens: 0,
            output_tokens: 0,
            requests: 0,
            cost_usd: 0,
          },
          breakdown: [],
        },
      }),
    })
  );
}

test.describe("API Key Management E2E Tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await clearAuth(page);
    await login(page, "student");
  });

  test("should show empty API key state", async ({ page }) => {
    await mockAPIKeyEndpoints(page, { hasKey: false });
    await page.goto("/settings");

    await expect(page.getByText("尚未設定 API Key")).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.getByRole("button", { name: /新增 API Key/ })
    ).toBeVisible();
  });

  test("should show API key info when key exists", async ({ page }) => {
    await mockAPIKeyEndpoints(page, { hasKey: true, keyName: "My Test Key" });
    await page.goto("/settings");

    await expect(page.getByText("API Key 資訊")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("My Test Key")).toBeVisible();
    await expect(page.getByText("已驗證")).toBeVisible();
  });

  test("should open modal and reject invalid key format", async ({ page }) => {
    await mockAPIKeyEndpoints(page, { hasKey: false });
    await page.goto("/settings");

    const addBtn = page.getByRole("button", { name: /新增 API Key/ });
    await addBtn.click({ timeout: 15000 });

    // Modal should appear with input
    const input = page.locator("#api-key-input");
    await expect(input).toBeVisible({ timeout: 5000 });

    // Type invalid key and submit
    await input.fill("invalid-key");
    await page.getByText("儲存").click();

    // Should show format error
    await expect(page.getByText(/無效的 API Key 格式/)).toBeVisible({
      timeout: 5000,
    });
  });

  test("should save valid API key successfully", async ({ page }) => {
    let postCalled = false;

    await mockAPIKeyEndpoints(page, { hasKey: false });

    // Override POST handler
    await page.route(
      (url) => url.pathname === "/api/v1/users/me/api-key",
      (route) => {
        if (route.request().method() === "POST") {
          postCalled = true;
          return route.fulfill({
            status: 201,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              message: "API Key 已成功保存",
              data: { is_validated: true, key_name: "My API Key" },
            }),
          });
        }
        // After save, return key info on GET
        if (route.request().method() === "GET") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              data: {
                has_key: true,
                is_validated: true,
                is_active: true,
                key_name: "My API Key",
                total_requests: 0,
                total_input_tokens: 0,
                total_output_tokens: 0,
                total_cost_usd: 0,
                created_at: new Date().toISOString(),
              },
            }),
          });
        }
        return route.continue();
      }
    );

    await page.goto("/settings");

    const addBtn = page.getByRole("button", { name: /新增 API Key/ });
    await addBtn.click({ timeout: 15000 });

    await page.locator("#api-key-input").fill("sk-ant-api03-validtestkey123");
    await page.getByText("儲存").click();

    // Should switch to key info view
    await expect(page.getByText("API Key 資訊")).toBeVisible({
      timeout: 15000,
    });
    expect(postCalled).toBe(true);
  });

  test("should delete API key after confirmation", async ({ page }) => {
    let deleted = false;

    await mockAPIKeyEndpoints(page, { hasKey: true, keyName: "My Key" });

    // Override DELETE handler
    await page.route(
      (url) => url.pathname === "/api/v1/users/me/api-key",
      (route) => {
        if (route.request().method() === "DELETE") {
          deleted = true;
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              message: "API Key 已成功刪除",
            }),
          });
        }
        if (route.request().method() === "GET") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              data: deleted ? { has_key: false } : {
                has_key: true,
                is_validated: true,
                is_active: true,
                key_name: "My Key",
                total_requests: 0,
                total_input_tokens: 0,
                total_output_tokens: 0,
                total_cost_usd: 0,
                created_at: "2026-01-01T00:00:00Z",
              },
            }),
          });
        }
        return route.continue();
      }
    );

    await page.goto("/settings");
    await expect(page.getByText("My Key")).toBeVisible({ timeout: 15000 });

    // Accept the confirm dialog
    page.on("dialog", (dialog) => dialog.accept());

    await page.getByRole("button", { name: /刪除 Key/ }).click();

    await expect(page.getByText("尚未設定 API Key")).toBeVisible({
      timeout: 15000,
    });
    expect(deleted).toBe(true);
  });
});
