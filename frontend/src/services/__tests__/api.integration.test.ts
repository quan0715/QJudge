/**
 * API Integration Tests - Index
 *
 * 這是 API 整合測試的入口檔案，包含通用的 API 格式驗證。
 * 各 domain 的測試已分離至獨立檔案：
 *
 * - auth.integration.test.ts      - Auth API 測試
 * - problems.integration.test.ts  - Problems API 測試
 * - submissions.integration.test.ts - Submissions API 測試
 * - contests.integration.test.ts  - Contests API 測試
 * - rbac.integration.test.ts      - RBAC 權限測試
 *
 * 執行前需要：
 * 1. 啟動測試環境: docker compose -f docker-compose.test.yml up -d
 * 2. 執行測試: npm run test:api
 */

import { describe, it, expect } from "vitest";
import { apiRequest, skipIfNoBackend, TEST_USERS } from "./setup";

describe("API Response Format", () => {
  it("should return consistent error format", async () => {
    const shouldSkip = await skipIfNoBackend();
    if (shouldSkip) return;

    const res = await apiRequest("/api/v1/auth/email/login", {
      method: "POST",
      body: JSON.stringify({
        email: "invalid",
        password: "short",
      }),
    });

    // Should return 400, 401, or 403 (rate limited)
    expect([400, 401, 403]).toContain(res.status);

    const data = await res.json();
    expect(data).toHaveProperty("success", false);
    // Error can be in 'error' or 'detail' field
    expect(data.error || data.detail).toBeDefined();
  });

  it("should return proper JSON content type", async () => {
    const shouldSkip = await skipIfNoBackend();
    if (shouldSkip) return;

    const res = await apiRequest("/api/v1/auth/email/login", {
      method: "POST",
      body: JSON.stringify(TEST_USERS.student),
    });

    const contentType = res.headers.get("content-type");
    expect(contentType).toContain("application/json");
  });
});
