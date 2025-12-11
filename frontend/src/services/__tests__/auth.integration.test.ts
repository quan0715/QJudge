/**
 * Auth API Integration Tests
 *
 * 測試 /api/v1/auth 相關端點
 */

import { describe, it, expect } from "vitest";
import { apiRequest, skipIfNoBackend, TEST_USERS, API_BASE_URL } from "./setup";

describe("Auth API - /api/v1/auth", () => {
  describe("POST /email/login", () => {
    it("should handle login request", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip) return;

      const res = await apiRequest("/api/v1/auth/email/login", {
        method: "POST",
        body: JSON.stringify(TEST_USERS.student),
      });

      // Either 200 (user exists) or 401 (user doesn't exist)
      expect([200, 401]).toContain(res.status);

      const data = await res.json();
      if (res.status === 200) {
        // Validate AuthResponseDto structure
        expect(data.success).toBe(true);
        expect(data.data).toHaveProperty("access_token");
        expect(typeof data.data.access_token).toBe("string");
        expect(data.data).toHaveProperty("refresh_token");
        expect(typeof data.data.refresh_token).toBe("string");
        // Validate user object in response
        expect(data.data).toHaveProperty("user");
        expect(data.data.user).toHaveProperty("id");
        expect(data.data.user).toHaveProperty("username");
        expect(data.data.user).toHaveProperty("role");
      } else {
        expect(data.success).toBe(false);
      }
    });

    it("should reject invalid credentials", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip) return;

      const res = await apiRequest("/api/v1/auth/email/login", {
        method: "POST",
        body: JSON.stringify({
          email: "wrong@test.com",
          password: "wrongpassword",
        }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
    });
  });

  describe("POST /email/register", () => {
    it("should register new user", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip) return;

      const timestamp = Date.now();
      const res = await apiRequest("/api/v1/auth/email/register", {
        method: "POST",
        body: JSON.stringify({
          email: `newuser${timestamp}@test.com`,
          username: `newuser${timestamp}`,
          password: "TestPass123!",
          password_confirm: "TestPass123!",
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty("access_token");
    });
  });

  describe("POST /refresh", () => {
    it("should handle token refresh", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip) return;

      // First login to get tokens
      const loginRes = await apiRequest("/api/v1/auth/email/login", {
        method: "POST",
        body: JSON.stringify(TEST_USERS.student),
      });
      const loginData = await loginRes.json();

      // Skip if login failed (no test user)
      if (loginRes.status !== 200 || !loginData.data?.refresh_token) {
        console.log("⚠️ Skipping refresh test: No valid login token");
        return;
      }

      const refreshToken = loginData.data.refresh_token;

      // Then refresh
      const res = await apiRequest("/api/v1/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refresh: refreshToken }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty("access_token");
    });
  });

  describe("Health Check", () => {
    it("should connect to backend API", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip) {
        console.log("⚠️ Skipping: Backend not available at " + API_BASE_URL);
        return;
      }

      // Backend is available if we get any response
      const res = await apiRequest("/api/v1/auth/email/login", {
        method: "POST",
        body: JSON.stringify({ email: "test", password: "test" }),
      });
      // Expect 400 or 401, not 5xx
      expect(res.status).toBeLessThan(500);
    });
  });
});
