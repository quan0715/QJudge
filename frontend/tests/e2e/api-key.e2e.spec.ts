/**
 * E2E Tests for API Key Management
 *
 * Tests the API Key settings page UI flows.
 * Uses route interception to mock backend responses (no real Anthropic key needed).
 */

import { test, expect, Page } from "@playwright/test";
import { loginViaAPI, clearAuth } from "../helpers/auth.helper";

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
    await page.goto("/");
    await clearAuth(page);
    await loginViaAPI(page, "student");
  });

  /** Navigate to /settings and switch to the API Key tab. */
  async function gotoAPIKeyTab(page: Page) {
    await page.goto("/settings");
    const apiKeyTab = page.getByRole("tab", { name: /API Key/i });
    await expect(apiKeyTab).toBeVisible({ timeout: 10000 });
    await apiKeyTab.click();
  }

  test("should show empty API key state", async ({ page }) => {
    await mockAPIKeyEndpoints(page, { hasKey: false });
    await gotoAPIKeyTab(page);

    await expect(page.getByText("尚未設定 API Key")).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.getByRole("button", { name: /新增 API Key/ })
    ).toBeVisible();
  });

  test("should show API key info when key exists", async ({ page }) => {
    await mockAPIKeyEndpoints(page, { hasKey: true, keyName: "My Test Key" });
    await gotoAPIKeyTab(page);

    await expect(page.getByText("API Key 資訊")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("My Test Key")).toBeVisible();
    await expect(page.getByText("已驗證")).toBeVisible();
  });

  test("should open modal and reject invalid key format", async ({ page }) => {
    await mockAPIKeyEndpoints(page, { hasKey: false });
    await gotoAPIKeyTab(page);

    const addBtn = page.getByRole("button", { name: /新增 API Key/ });
    await addBtn.click({ timeout: 15000 });

    // Modal should appear with input
    const input = page.locator("#api-key-input");
    await expect(input).toBeVisible({ timeout: 5000 });

    // Type invalid key and submit
    await input.fill("invalid-key");
    await page.getByRole("button", { name: "儲存" }).click();

    // Should show format error (appears in both notification and form, use first)
    await expect(page.getByText(/無效的 API Key 格式/).first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("should save valid API key successfully", async ({ page }) => {
    let postCalled = false;
    let saved = false;

    // Single route handler with state tracking (later routes take priority)
    await page.route(
      (url) =>
        url.pathname === "/api/v1/users/me/api-key" &&
        !url.search.includes("usage"),
      (route) => {
        if (route.request().method() === "POST") {
          postCalled = true;
          saved = true;
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
        if (route.request().method() === "GET") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              data: saved
                ? {
                    has_key: true,
                    is_validated: true,
                    is_active: true,
                    key_name: "My API Key",
                    total_requests: 0,
                    total_input_tokens: 0,
                    total_output_tokens: 0,
                    total_cost_usd: 0,
                    created_at: new Date().toISOString(),
                  }
                : { has_key: false },
            }),
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
            total: { input_tokens: 0, output_tokens: 0, requests: 0, cost_usd: 0 },
            breakdown: [],
          },
        }),
      })
    );

    await gotoAPIKeyTab(page);

    const addBtn = page.getByRole("button", { name: /新增 API Key/ });
    await addBtn.click({ timeout: 15000 });

    await page.locator("#api-key-input").fill("sk-ant-api03-validtestkey123");
    await page.getByRole("button", { name: "儲存" }).click();

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

    await gotoAPIKeyTab(page);
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
