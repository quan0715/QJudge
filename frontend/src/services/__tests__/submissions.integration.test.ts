/**
 * Submissions API Integration Tests
 *
 * 測試 /api/v1/submissions 相關端點
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  apiRequest,
  authenticatedRequest,
  skipIfNoBackend,
  loginAs,
} from "./setup";

describe("Submissions API - /api/v1/submissions", () => {
  let authToken: string | null = null;

  beforeAll(async () => {
    const shouldSkip = await skipIfNoBackend();
    if (shouldSkip) return;

    const result = await loginAs("student");
    authToken = result?.token || null;
  });

  describe("GET /", () => {
    it("should list submissions matching SubmissionDto", async () => {
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

    it("should reject unauthenticated requests", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip) return;

      const res = await apiRequest("/api/v1/submissions/");
      expect(res.status).toBe(401);
    });

    it("should support filtering by user ID", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip || !authToken) return;

      // Get current user info first to get user ID
      const userRes = await authenticatedRequest(
        "/api/v1/users/me/",
        authToken
      );
      if (userRes.status !== 200) return;

      const userData = await userRes.json();
      const userId = userData.id;

      // Request submissions filtered by user ID
      const res = await authenticatedRequest(
        `/api/v1/submissions/?source_type=practice&user=${userId}`,
        authToken
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      const submissions = data.results || data;
      expect(Array.isArray(submissions)).toBe(true);

      // All returned submissions should belong to the filtered user
      submissions.forEach((submission: any) => {
        // Check user field - can be user ID directly or nested object
        const submissionUserId =
          typeof submission.user === "object"
            ? submission.user.id
            : submission.user;
        expect(submissionUserId).toBe(userId);
      });
    });

    it("should handle filtering by non-existent user", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip || !authToken) return;

      // Use a very large user ID that shouldn't exist
      const res = await authenticatedRequest(
        "/api/v1/submissions/?source_type=practice&user=999999",
        authToken
      );

      // Backend may return 200 with empty array or 400 for invalid user
      expect([200, 400]).toContain(res.status);

      if (res.status === 200) {
        const data = await res.json();
        const submissions = data.results || data;
        expect(Array.isArray(submissions)).toBe(true);
        expect(submissions.length).toBe(0);
      }
    });
  });
});
