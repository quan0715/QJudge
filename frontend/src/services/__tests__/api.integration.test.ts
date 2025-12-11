/**
 * API Integration Tests
 *
 * 這些測試會發送真實的 API 請求到測試後端，
 * 用於驗證前端 API service 與後端的連接是否正確。
 *
 * 執行前需要：
 * 1. 啟動測試環境: docker compose -f docker-compose.test.yml up -d
 * 2. 執行測試: npm run test:api
 */

import { describe, it, expect, beforeAll } from "vitest";

// API Base URL for test environment
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8001";

// Test credentials
// Note: These users may or may not exist depending on whether seed data was run
const TEST_USERS = {
  student: {
    email: "student@test.com",
    password: "testpass123",
  },
  teacher: {
    email: "teacher@test.com",
    password: "testpass123",
  },
  admin: {
    email: "admin@test.com",
    password: "testpass123",
  },
};

// Track if test users exist
let testUsersExist = false;

// Helper to make API requests
async function apiRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...options.headers,
  };

  return fetch(url, { ...options, headers });
}

// Helper to make authenticated requests
async function authenticatedRequest(
  endpoint: string,
  token: string,
  options: RequestInit = {}
): Promise<Response> {
  return apiRequest(endpoint, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}

describe("API Integration Tests", () => {
  // Skip if no test environment - check using a known endpoint
  const skipIfNoBackend = async () => {
    try {
      // Use login endpoint with invalid data - should return 400/401, not connection error
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/email/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@test.com", password: "test" }),
      });
      // Any HTTP response means backend is available
      return false;
    } catch {
      return true;
    }
  };

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

  describe("Auth API - /api/v1/auth", () => {
    it("POST /email/login - should handle login request", async () => {
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
        testUsersExist = true;
        expect(data.success).toBe(true);
        expect(data.data).toHaveProperty("access_token");
        expect(data.data).toHaveProperty("refresh_token");
      } else {
        expect(data.success).toBe(false);
      }
    });

    it("POST /email/login - should reject invalid credentials", async () => {
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

    it("POST /email/register - should register new user", async () => {
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

    it("POST /refresh - should handle token refresh", async () => {
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

  describe("Problems API - /api/v1/problems", () => {
    let authToken: string;

    beforeAll(async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip) return;

      const res = await apiRequest("/api/v1/auth/email/login", {
        method: "POST",
        body: JSON.stringify(TEST_USERS.student),
      });
      const data = await res.json();
      authToken = data.data?.access_token;
    });

    it("GET / - should list problems (authenticated)", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip || !authToken) return;

      const res = await authenticatedRequest("/api/v1/problems/", authToken);

      expect(res.status).toBe(200);
      const data = await res.json();

      // Should have results array (paginated) or direct array
      const problems = data.results || data;
      expect(Array.isArray(problems)).toBe(true);
    });

    it("GET / - unauthenticated access behavior", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip) return;

      const res = await apiRequest("/api/v1/problems/");

      // Problems list may be public or require auth depending on config
      // Just verify we get a valid response
      expect(res.status).toBeLessThan(500);

      // If 200, it's public; if 401, it requires auth
      console.log(`Problems API without auth: ${res.status}`);
    });

    it("GET /:id - should return problem detail", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip || !authToken) return;

      // First get list to find a problem ID
      const listRes = await authenticatedRequest(
        "/api/v1/problems/",
        authToken
      );
      const listData = await listRes.json();
      const problems = listData.results || listData;

      if (problems.length === 0) {
        console.log("⚠️ No problems found, skipping detail test");
        return;
      }

      const problemId = problems[0].id;
      const res = await authenticatedRequest(
        `/api/v1/problems/${problemId}/`,
        authToken
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty("id");
      expect(data).toHaveProperty("title");
    });
  });

  describe("Submissions API - /api/v1/submissions", () => {
    let authToken: string;

    beforeAll(async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip) return;

      const res = await apiRequest("/api/v1/auth/email/login", {
        method: "POST",
        body: JSON.stringify(TEST_USERS.student),
      });
      const data = await res.json();
      authToken = data.data?.access_token;
    });

    it("GET / - should list submissions with source_type filter", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip || !authToken) return;

      const res = await authenticatedRequest(
        "/api/v1/submissions/?source_type=practice",
        authToken
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      const submissions = data.results || data;
      expect(Array.isArray(submissions)).toBe(true);
    });

    it("GET / - should reject unauthenticated requests", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip) return;

      const res = await apiRequest("/api/v1/submissions/");
      expect(res.status).toBe(401);
    });
  });

  describe("Contests API - /api/v1/contests", () => {
    let authToken: string;

    beforeAll(async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip) return;

      const res = await apiRequest("/api/v1/auth/email/login", {
        method: "POST",
        body: JSON.stringify(TEST_USERS.student),
      });
      const data = await res.json();
      authToken = data.data?.access_token;
    });

    it("GET / - should list contests", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip || !authToken) return;

      const res = await authenticatedRequest("/api/v1/contests/", authToken);

      expect(res.status).toBe(200);
      const data = await res.json();
      const contests = data.results || data;
      expect(Array.isArray(contests)).toBe(true);
    });
  });

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
});
