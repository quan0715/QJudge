/**
 * E2E Tests for API Key Management
 *
 * Tests the API Key settings page: view, add, update, delete flows.
 * Uses route interception to mock backend responses (no real Anthropic key needed).
 */

import { test, expect } from "@playwright/test";
import { login, clearAuth } from "../helpers/auth.helper";

test.describe("API Key Management E2E Tests", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await clearAuth(page);
    await login(page, "student");
  });

  test("should navigate to settings page and see empty API key state", async ({
    page,
  }) => {
    // Intercept API to return no key
    await page.route("**/api/v1/users/me/api-key", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, data: { has_key: false } }),
        });
      }
      return route.continue();
    });

    await page.goto("/settings");

    // Should see empty state message
    await expect(page.getByText("尚未設定 API Key")).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.getByRole("button", { name: /新增 API Key/ })
    ).toBeVisible();
  });

  test("should show API key info when key exists", async ({ page }) => {
    await page.route("**/api/v1/users/me/api-key", (route) => {
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
              key_name: "Test Key",
              total_requests: 10,
              total_input_tokens: 500,
              total_output_tokens: 200,
              total_cost_usd: 0.02,
              created_at: "2026-01-15T00:00:00Z",
            },
          }),
        });
      }
      return route.continue();
    });

    // Also mock usage endpoint
    await page.route("**/api/v1/users/me/api-key/usage*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { total: { input_tokens: 0, output_tokens: 0, requests: 0, cost_usd: 0 }, breakdown: [] },
        }),
      })
    );

    await page.goto("/settings");

    await expect(page.getByText("API Key 資訊")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText("Test Key")).toBeVisible();
    await expect(page.getByText("已驗證")).toBeVisible();
    await expect(page.getByText("啟用中")).toBeVisible();
  });

  test("should open modal and validate key format client-side", async ({
    page,
  }) => {
    await page.route("**/api/v1/users/me/api-key", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, data: { has_key: false } }),
        });
      }
      return route.continue();
    });

    await page.goto("/settings");

    // Click add button
    await page.getByRole("button", { name: /新增 API Key/ }).click();

    // Modal should appear
    await expect(page.getByText("Anthropic API Key")).toBeVisible();

    // Type invalid key
    await page.fill("#api-key-input", "invalid-key");

    // Click save
    await page.getByText("儲存").click();

    // Should show format error
    await expect(page.getByText(/無效的 API Key 格式/)).toBeVisible({
      timeout: 5000,
    });
  });

  test("should save API key successfully", async ({ page }) => {
    let postCalled = false;

    await page.route("**/api/v1/users/me/api-key", (route) => {
      const method = route.request().method();
      if (method === "GET" && !postCalled) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, data: { has_key: false } }),
        });
      }
      if (method === "POST") {
        postCalled = true;
        const body = route.request().postDataJSON();
        expect(body.api_key).toContain("sk-ant-api03-");
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            message: "API Key 已成功保存",
            data: { is_validated: true, key_name: body.key_name },
          }),
        });
      }
      // After POST, GET returns key info
      if (method === "GET" && postCalled) {
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
    });

    await page.route("**/api/v1/users/me/api-key/usage*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { total: { input_tokens: 0, output_tokens: 0, requests: 0, cost_usd: 0 }, breakdown: [] },
        }),
      })
    );

    await page.goto("/settings");

    // Open modal
    await page.getByRole("button", { name: /新增 API Key/ }).click();

    // Fill valid key
    await page.fill("#api-key-input", "sk-ant-api03-validtestkey123");

    // Submit
    await page.getByText("儲存").click();

    // Should show success and switch to key info view
    await expect(page.getByText("API Key 資訊")).toBeVisible({
      timeout: 10000,
    });
    expect(postCalled).toBe(true);
  });

  test("should show error when save fails", async ({ page }) => {
    await page.route("**/api/v1/users/me/api-key", (route) => {
      const method = route.request().method();
      if (method === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, data: { has_key: false } }),
        });
      }
      if (method === "POST") {
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            error: {
              code: "VALIDATION_FAILED",
              message: "API Key 驗證失敗: Invalid API key",
            },
          }),
        });
      }
      return route.continue();
    });

    await page.goto("/settings");
    await page.getByRole("button", { name: /新增 API Key/ }).click();
    await page.fill("#api-key-input", "sk-ant-api03-badkey123");
    await page.getByText("儲存").click();

    // Should show error notification
    await expect(
      page.getByText(/API Key 驗證失敗|儲存失敗|Invalid/)
    ).toBeVisible({ timeout: 5000 });
  });

  test("should delete API key after confirmation", async ({ page }) => {
    let deleted = false;

    await page.route("**/api/v1/users/me/api-key", (route) => {
      const method = route.request().method();
      if (method === "GET" && !deleted) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {
              has_key: true,
              is_validated: true,
              is_active: true,
              key_name: "My Key",
              total_requests: 5,
              total_input_tokens: 100,
              total_output_tokens: 50,
              total_cost_usd: 0.01,
              created_at: "2026-01-01T00:00:00Z",
            },
          }),
        });
      }
      if (method === "DELETE") {
        deleted = true;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, message: "API Key 已成功刪除" }),
        });
      }
      if (method === "GET" && deleted) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, data: { has_key: false } }),
        });
      }
      return route.continue();
    });

    await page.route("**/api/v1/users/me/api-key/usage*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { total: { input_tokens: 0, output_tokens: 0, requests: 0, cost_usd: 0 }, breakdown: [] },
        }),
      })
    );

    await page.goto("/settings");

    // Wait for key info to load
    await expect(page.getByText("My Key")).toBeVisible({ timeout: 10000 });

    // Accept the confirm dialog
    page.on("dialog", (dialog) => dialog.accept());

    // Click delete
    await page.getByRole("button", { name: /刪除 Key/ }).click();

    // Should switch back to empty state
    await expect(page.getByText("尚未設定 API Key")).toBeVisible({
      timeout: 10000,
    });
    expect(deleted).toBe(true);
  });
});
