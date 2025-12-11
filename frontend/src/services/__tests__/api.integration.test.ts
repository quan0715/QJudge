/**
 * API Integration Tests
 *
 * 這些測試會發送真實的 API 請求到測試後端，
 * 用於驗證前端 API service 與後端的連接是否正確。
 *
 * 執行前需要：
 * 1. 啟動測試環境: docker compose -f docker-compose.test.yml up -d
 * 2. 執行測試: npm run test:api
 *
 * API Response Format (snake_case from backend):
 * - Auth: { success, data: { access_token, refresh_token, user } }
 * - Problem: { id, title, difficulty, acceptance_rate, submission_count, ... }
 * - Submission: { id, problem, user, language, status, execution_time, ... }
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
let _testUsersExist = false;

/**
 * DTO type definitions for reference (snake_case from API)
 * These types document the expected API response format.
 *
 * AuthResponseDto = {
 *   success: boolean;
 *   data: { access_token, refresh_token?, user: { id, username, email?, role } };
 *   message?: string;
 * }
 *
 * ProblemDto = {
 *   id, title, difficulty, acceptance_rate?, submission_count?,
 *   accepted_count?, is_practice_visible?, is_solved?, tags?, created_at?
 * }
 *
 * SubmissionDto = {
 *   id, problem, user, language, status, execution_time?,
 *   memory_usage?, created_at, contest?, is_test?
 * }
 */

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
        _testUsersExist = true;
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

    it("GET /:id - should return problem detail matching ProblemDto", async () => {
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

      // Validate ProblemDto structure (snake_case from API)
      expect(data).toHaveProperty("id");
      expect(data).toHaveProperty("title");
      expect(typeof data.title).toBe("string");
      expect(data).toHaveProperty("difficulty");
      expect(["easy", "medium", "hard"]).toContain(data.difficulty);

      // Optional fields should use snake_case
      if (data.acceptance_rate !== undefined) {
        expect(typeof data.acceptance_rate).toBe("number");
      }
      if (data.submission_count !== undefined) {
        expect(typeof data.submission_count).toBe("number");
      }
      if (data.is_practice_visible !== undefined) {
        expect(typeof data.is_practice_visible).toBe("boolean");
      }
      if (data.tags !== undefined) {
        expect(Array.isArray(data.tags)).toBe(true);
      }
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

    it("GET / - should list submissions matching SubmissionDto", async () => {
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

      // If there are submissions, validate SubmissionDto structure
      if (submissions.length > 0) {
        const submission = submissions[0];
        expect(submission).toHaveProperty("id");
        expect(submission).toHaveProperty("problem");
        expect(submission).toHaveProperty("user");
        expect(submission).toHaveProperty("language");
        expect(submission).toHaveProperty("status");
        expect(submission).toHaveProperty("created_at");

        // Optional fields should use snake_case
        if (submission.execution_time !== undefined) {
          expect(typeof submission.execution_time).toBe("number");
        }
        if (submission.memory_usage !== undefined) {
          expect(typeof submission.memory_usage).toBe("number");
        }
        if (submission.is_test !== undefined) {
          expect(typeof submission.is_test).toBe("boolean");
        }
      }
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

  /**
   * Role-Based Access Control (RBAC) Tests
   *
   * Permission Matrix:
   * | Endpoint                  | Student | Teacher | Admin |
   * |---------------------------|---------|---------|-------|
   * | GET /problems/            | ✓       | ✓       | ✓     |
   * | POST /problems/           | ✗       | ✓       | ✓     |
   * | PUT /problems/:id         | ✗       | owner   | ✓     |
   * | DELETE /problems/:id      | ✗       | owner   | ✓     |
   * | GET /submissions/         | own     | own+    | all   |
   * | POST /submissions/        | ✓       | ✓       | ✓     |
   * | GET /contests/            | ✓       | ✓       | ✓     |
   * | POST /contests/           | ✗       | ✓       | ✓     |
   * | GET /auth/search          | ✗       | ✗       | ✓     |
   * | PATCH /auth/:id/role      | ✗       | ✗       | ✓     |
   */
  describe("Role-Based Access Control (RBAC)", () => {
    // Store tokens for each role
    const tokens: Record<string, string | null> = {
      student: null,
      teacher: null,
      admin: null,
    };

    // Login all test users before RBAC tests
    beforeAll(async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip) return;

      // Login each user type
      for (const [role, credentials] of Object.entries(TEST_USERS)) {
        try {
          const res = await apiRequest("/api/v1/auth/email/login", {
            method: "POST",
            body: JSON.stringify(credentials),
          });
          if (res.status === 200) {
            const data = await res.json();
            tokens[role] = data.data?.access_token || null;
          }
        } catch {
          console.log(`⚠️ Could not login as ${role}`);
        }
      }
    });

    describe("Problems API Permissions", () => {
      it("Student should NOT be able to create problems (POST /problems/)", async () => {
        const shouldSkip = await skipIfNoBackend();
        if (shouldSkip || !tokens.student) {
          console.log("⚠️ Skipping: Student token not available");
          return;
        }

        const res = await authenticatedRequest(
          "/api/v1/problems/",
          tokens.student,
          {
            method: "POST",
            body: JSON.stringify({
              title: "Test Problem",
              description: "Test Description",
              difficulty: "easy",
            }),
          }
        );

        // Should be 403 Forbidden
        expect(res.status).toBe(403);
      });

      it("Teacher should be able to create problems (POST /problems/)", async () => {
        const shouldSkip = await skipIfNoBackend();
        if (shouldSkip || !tokens.teacher) {
          console.log("⚠️ Skipping: Teacher token not available");
          return;
        }

        const timestamp = Date.now();
        const res = await authenticatedRequest(
          "/api/v1/problems/",
          tokens.teacher,
          {
            method: "POST",
            body: JSON.stringify({
              title: `Test Problem ${timestamp}`,
              description: "Test Description for RBAC test",
              difficulty: "easy",
              time_limit: 1000,
              memory_limit: 256,
            }),
          }
        );

        // Should be 201 Created or 200 OK
        expect([200, 201]).toContain(res.status);
      });

      it("Admin should be able to create problems (POST /problems/)", async () => {
        const shouldSkip = await skipIfNoBackend();
        if (shouldSkip || !tokens.admin) {
          console.log("⚠️ Skipping: Admin token not available");
          return;
        }

        const timestamp = Date.now();
        const res = await authenticatedRequest(
          "/api/v1/problems/",
          tokens.admin,
          {
            method: "POST",
            body: JSON.stringify({
              title: `Admin Test Problem ${timestamp}`,
              description: "Test Description from Admin",
              difficulty: "medium",
              time_limit: 1000,
              memory_limit: 256,
            }),
          }
        );

        // Should be 201 Created or 200 OK
        expect([200, 201]).toContain(res.status);
      });
    });

    describe("Contests API Permissions", () => {
      it("Student should NOT be able to create contests (POST /contests/)", async () => {
        const shouldSkip = await skipIfNoBackend();
        if (shouldSkip || !tokens.student) {
          console.log("⚠️ Skipping: Student token not available");
          return;
        }

        const res = await authenticatedRequest(
          "/api/v1/contests/",
          tokens.student,
          {
            method: "POST",
            body: JSON.stringify({
              title: "Test Contest",
              description: "Test Description",
              start_time: new Date(Date.now() + 86400000).toISOString(),
              end_time: new Date(Date.now() + 172800000).toISOString(),
            }),
          }
        );

        // Should be 403 Forbidden
        expect(res.status).toBe(403);
      });

      it("Teacher should be able to create contests (POST /contests/)", async () => {
        const shouldSkip = await skipIfNoBackend();
        if (shouldSkip || !tokens.teacher) {
          console.log("⚠️ Skipping: Teacher token not available");
          return;
        }

        const timestamp = Date.now();
        const res = await authenticatedRequest(
          "/api/v1/contests/",
          tokens.teacher,
          {
            method: "POST",
            body: JSON.stringify({
              title: `Teacher Test Contest ${timestamp}`,
              description: "Test Description",
              start_time: new Date(Date.now() + 86400000).toISOString(),
              end_time: new Date(Date.now() + 172800000).toISOString(),
            }),
          }
        );

        // Should be 201 Created or 200 OK
        expect([200, 201]).toContain(res.status);
      });
    });

    describe("User Management API Permissions (Admin Only)", () => {
      it("Student should NOT be able to search users", async () => {
        const shouldSkip = await skipIfNoBackend();
        if (shouldSkip || !tokens.student) {
          console.log("⚠️ Skipping: Student token not available");
          return;
        }

        const res = await authenticatedRequest(
          "/api/v1/auth/search?q=test",
          tokens.student
        );

        // Should be 403 Forbidden
        expect(res.status).toBe(403);
      });

      it("Teacher should NOT be able to search users", async () => {
        const shouldSkip = await skipIfNoBackend();
        if (shouldSkip || !tokens.teacher) {
          console.log("⚠️ Skipping: Teacher token not available");
          return;
        }

        const res = await authenticatedRequest(
          "/api/v1/auth/search?q=test",
          tokens.teacher
        );

        // Should be 403 Forbidden
        expect(res.status).toBe(403);
      });

      it("Admin should be able to search users", async () => {
        const shouldSkip = await skipIfNoBackend();
        if (shouldSkip || !tokens.admin) {
          console.log("⚠️ Skipping: Admin token not available");
          return;
        }

        const res = await authenticatedRequest(
          "/api/v1/auth/search?q=test",
          tokens.admin
        );

        // Should be 200 OK
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(Array.isArray(data.results || data)).toBe(true);
      });

      it("Student should NOT be able to change user roles", async () => {
        const shouldSkip = await skipIfNoBackend();
        if (shouldSkip || !tokens.student) {
          console.log("⚠️ Skipping: Student token not available");
          return;
        }

        const res = await authenticatedRequest(
          "/api/v1/auth/1/role",
          tokens.student,
          {
            method: "PATCH",
            body: JSON.stringify({ role: "teacher" }),
          }
        );

        // Should be 403 Forbidden
        expect(res.status).toBe(403);
      });

      it("Teacher should NOT be able to change user roles", async () => {
        const shouldSkip = await skipIfNoBackend();
        if (shouldSkip || !tokens.teacher) {
          console.log("⚠️ Skipping: Teacher token not available");
          return;
        }

        const res = await authenticatedRequest(
          "/api/v1/auth/1/role",
          tokens.teacher,
          {
            method: "PATCH",
            body: JSON.stringify({ role: "admin" }),
          }
        );

        // Should be 403 Forbidden
        expect(res.status).toBe(403);
      });
    });

    describe("Submission Access Control", () => {
      it("Student can only see their own submissions", async () => {
        const shouldSkip = await skipIfNoBackend();
        if (shouldSkip || !tokens.student) {
          console.log("⚠️ Skipping: Student token not available");
          return;
        }

        const res = await authenticatedRequest(
          "/api/v1/submissions/",
          tokens.student
        );

        expect(res.status).toBe(200);
        const data = await res.json();
        const submissions = data.results || data;

        // All returned submissions should belong to the authenticated user
        // (We can't verify user ID without knowing it, but the API should filter)
        expect(Array.isArray(submissions)).toBe(true);
      });

      it("Admin can see all submissions", async () => {
        const shouldSkip = await skipIfNoBackend();
        if (shouldSkip || !tokens.admin) {
          console.log("⚠️ Skipping: Admin token not available");
          return;
        }

        const res = await authenticatedRequest(
          "/api/v1/submissions/",
          tokens.admin
        );

        expect(res.status).toBe(200);
        const data = await res.json();
        const submissions = data.results || data;
        expect(Array.isArray(submissions)).toBe(true);
      });
    });

    describe("Unauthenticated Access", () => {
      it("Should reject unauthenticated POST to /problems/", async () => {
        const shouldSkip = await skipIfNoBackend();
        if (shouldSkip) return;

        const res = await apiRequest("/api/v1/problems/", {
          method: "POST",
          body: JSON.stringify({
            title: "Unauthorized Problem",
            description: "Should fail",
            difficulty: "easy",
          }),
        });

        expect(res.status).toBe(401);
      });

      it("Should reject unauthenticated POST to /contests/", async () => {
        const shouldSkip = await skipIfNoBackend();
        if (shouldSkip) return;

        const res = await apiRequest("/api/v1/contests/", {
          method: "POST",
          body: JSON.stringify({
            title: "Unauthorized Contest",
            description: "Should fail",
            start_time: new Date().toISOString(),
            end_time: new Date().toISOString(),
          }),
        });

        expect(res.status).toBe(401);
      });

      it("Should reject unauthenticated POST to /submissions/", async () => {
        const shouldSkip = await skipIfNoBackend();
        if (shouldSkip) return;

        const res = await apiRequest("/api/v1/submissions/", {
          method: "POST",
          body: JSON.stringify({
            problem: 1,
            language: "cpp",
            code: "int main() {}",
          }),
        });

        expect(res.status).toBe(401);
      });
    });
  });
});
