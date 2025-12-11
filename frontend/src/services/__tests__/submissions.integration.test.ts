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
  });
});
