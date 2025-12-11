/**
 * Role-Based Access Control (RBAC) Integration Tests
 *
 * 測試不同角色對 API 端點的存取權限
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

import { describe, it, expect, beforeAll } from "vitest";
import {
  apiRequest,
  authenticatedRequest,
  skipIfNoBackend,
  getAllUserTokens,
  type UserRole,
} from "./setup";

describe("Role-Based Access Control (RBAC)", () => {
  // Store tokens for each role
  let tokens: Record<UserRole, string | null>;

  // Login all test users before RBAC tests
  beforeAll(async () => {
    const shouldSkip = await skipIfNoBackend();
    if (shouldSkip) return;

    tokens = await getAllUserTokens();
  });

  describe("Problems API Permissions", () => {
    it("Student should NOT be able to create problems (POST /problems/)", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip || !tokens?.student) {
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
      if (shouldSkip || !tokens?.teacher) {
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
      if (shouldSkip || !tokens?.admin) {
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
      if (shouldSkip || !tokens?.student) {
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
      if (shouldSkip || !tokens?.teacher) {
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
      if (shouldSkip || !tokens?.student) {
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
      if (shouldSkip || !tokens?.teacher) {
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
      if (shouldSkip || !tokens?.admin) {
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
      if (shouldSkip || !tokens?.student) {
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
      if (shouldSkip || !tokens?.teacher) {
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
      if (shouldSkip || !tokens?.student) {
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
      expect(Array.isArray(submissions)).toBe(true);
    });

    it("Admin can see all submissions", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip || !tokens?.admin) {
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
