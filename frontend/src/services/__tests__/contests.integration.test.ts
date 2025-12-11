/**
 * Contests API Integration Tests
 *
 * 測試 /api/v1/contests 相關端點
 */

import { describe, it, expect, beforeAll } from "vitest";
import { authenticatedRequest, skipIfNoBackend, loginAs } from "./setup";

describe("Contests API - /api/v1/contests", () => {
  let authToken: string | null = null;

  beforeAll(async () => {
    const shouldSkip = await skipIfNoBackend();
    if (shouldSkip) return;

    const result = await loginAs("student");
    authToken = result?.token || null;
  });

  describe("GET /", () => {
    it("should list contests", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip || !authToken) return;

      const res = await authenticatedRequest("/api/v1/contests/", authToken);

      expect(res.status).toBe(200);
      const data = await res.json();
      const contests = data.results || data;
      expect(Array.isArray(contests)).toBe(true);

      // If there are contests, validate ContestDto structure
      if (contests.length > 0) {
        const contest = contests[0];
        expect(contest).toHaveProperty("id");
        expect(contest).toHaveProperty("title");
        expect(typeof contest.title).toBe("string");

        // Optional fields
        if (contest.start_time !== undefined) {
          expect(typeof contest.start_time).toBe("string");
        }
        if (contest.end_time !== undefined) {
          expect(typeof contest.end_time).toBe("string");
        }
        if (contest.status !== undefined) {
          expect(typeof contest.status).toBe("string");
        }
      }
    });
  });

  describe("GET /:id", () => {
    it("should return contest detail", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip || !authToken) return;

      // First get list to find a contest ID
      const listRes = await authenticatedRequest(
        "/api/v1/contests/",
        authToken
      );
      const listData = await listRes.json();
      const contests = listData.results || listData;

      if (contests.length === 0) {
        console.log("⚠️ No contests found, skipping detail test");
        return;
      }

      const contestId = contests[0].id;
      const res = await authenticatedRequest(
        `/api/v1/contests/${contestId}/`,
        authToken
      );

      expect(res.status).toBe(200);
      const data = await res.json();

      // Validate ContestDto structure
      expect(data).toHaveProperty("id");
      expect(data).toHaveProperty("title");
      expect(typeof data.title).toBe("string");
    });
  });
});
