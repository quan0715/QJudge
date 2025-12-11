/**
 * Problems API Integration Tests
 *
 * 測試 /api/v1/problems 相關端點
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  apiRequest,
  authenticatedRequest,
  skipIfNoBackend,
  loginAs,
} from "./setup";

describe("Problems API - /api/v1/problems", () => {
  let authToken: string | null = null;

  beforeAll(async () => {
    const shouldSkip = await skipIfNoBackend();
    if (shouldSkip) return;

    const result = await loginAs("student");
    authToken = result?.token || null;
  });

  describe("GET /", () => {
    it("should list problems (authenticated)", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip || !authToken) return;

      const res = await authenticatedRequest("/api/v1/problems/", authToken);

      expect(res.status).toBe(200);
      const data = await res.json();

      // Should have results array (paginated) or direct array
      const problems = data.results || data;
      expect(Array.isArray(problems)).toBe(true);
    });

    it("unauthenticated access behavior", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip) return;

      const res = await apiRequest("/api/v1/problems/");

      // Problems list may be public or require auth depending on config
      // Just verify we get a valid response
      expect(res.status).toBeLessThan(500);

      // If 200, it's public; if 401, it requires auth
      console.log(`Problems API without auth: ${res.status}`);
    });
  });

  describe("GET /:id", () => {
    it("should return problem detail matching ProblemDto", async () => {
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
});
