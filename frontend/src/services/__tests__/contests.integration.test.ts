/**
 * Contests API Integration Tests
 *
 * 測試 /api/v1/contests 相關端點
 */

import { describe, it, expect, beforeAll } from "vitest";
import { authenticatedRequest, skipIfNoBackend, loginAs } from "./setup";

describe("Contests API - /api/v1/contests", () => {
  let authToken: string | null = null;
  let adminToken: string | null = null;

  beforeAll(async () => {
    const shouldSkip = await skipIfNoBackend();
    if (shouldSkip) return;

    const studentResult = await loginAs("student");
    authToken = studentResult?.token || null;

    const adminResult = await loginAs("admin");
    adminToken = adminResult?.token || null;
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
        expect(contest).toHaveProperty("name");
        expect(typeof contest.name).toBe("string");

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
      expect(data).toHaveProperty("name");
      expect(typeof data.name).toBe("string");
    });
  });

  describe("GET /:id/standings", () => {
    it("should return standings with score fields", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip || !adminToken) return;

      // First get list to find an active contest
      const listRes = await authenticatedRequest(
        "/api/v1/contests/",
        adminToken
      );
      const listData = await listRes.json();
      const contests = listData.results || listData;

      // Find an active contest
      const activeContest = contests.find(
        (c: any) => c.status === "active" || c.status === "ended"
      );

      if (!activeContest) {
        console.log(
          "⚠️ No active/ended contests found, skipping standings test"
        );
        return;
      }

      const contestId = activeContest.id;
      const res = await authenticatedRequest(
        `/api/v1/contests/${contestId}/standings/`,
        adminToken
      );

      expect(res.status).toBe(200);
      const data = await res.json();

      // Validate standings response structure
      expect(data).toHaveProperty("problems");
      expect(data).toHaveProperty("standings");
      expect(Array.isArray(data.problems)).toBe(true);
      expect(Array.isArray(data.standings)).toBe(true);

      // Validate problems have score field
      if (data.problems.length > 0) {
        const problem = data.problems[0];
        expect(problem).toHaveProperty("id");
        expect(problem).toHaveProperty("label");
        expect(problem).toHaveProperty("score");
        console.log(`✓ Problem ${problem.label} max score: ${problem.score}`);
      }

      // Validate standings structure with score support
      if (data.standings.length > 0) {
        const standing = data.standings[0];
        expect(standing).toHaveProperty("rank");
        expect(standing).toHaveProperty("solved");
        expect(standing).toHaveProperty("total_score");
        expect(standing).toHaveProperty("time");
        expect(standing).toHaveProperty("problems");
        expect(typeof standing.total_score).toBe("number");

        console.log(
          `✓ Standing for user: rank=${standing.rank}, solved=${standing.solved}, total_score=${standing.total_score}`
        );

        // Validate problem cells have score field
        const problemIds = Object.keys(standing.problems);
        if (problemIds.length > 0) {
          const problemCell = standing.problems[problemIds[0]];
          expect(problemCell).toHaveProperty("status");
          expect(problemCell).toHaveProperty("tries");
          expect(problemCell).toHaveProperty("score");
          expect(problemCell).toHaveProperty("max_score");

          console.log(
            `✓ Problem cell: status=${problemCell.status}, score=${problemCell.score}, max_score=${problemCell.max_score}`
          );

          // If AC, score should equal max_score
          if (problemCell.status === "AC") {
            expect(problemCell.score).toBe(problemCell.max_score);
          }

          // Score should be >= 0 and <= max_score
          expect(problemCell.score).toBeGreaterThanOrEqual(0);
          expect(problemCell.score).toBeLessThanOrEqual(problemCell.max_score);
        }
      }
    });

    it("should correctly sum total_score from problem scores", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip || !adminToken) return;

      // Get an active contest
      const listRes = await authenticatedRequest(
        "/api/v1/contests/",
        adminToken
      );
      const contests = (await listRes.json()).results || (await listRes.json());
      const activeContest = contests.find(
        (c: any) => c.status === "active" || c.status === "ended"
      );

      if (!activeContest) {
        console.log("⚠️ No active/ended contests, skipping score sum test");
        return;
      }

      const res = await authenticatedRequest(
        `/api/v1/contests/${activeContest.id}/standings/`,
        adminToken
      );
      const data = await res.json();

      // Verify total_score equals sum of individual problem scores
      data.standings.forEach((standing: any) => {
        const calculatedTotal = Object.values(standing.problems).reduce(
          (sum: number, cell: any) => sum + (cell.score || 0),
          0
        );
        expect(standing.total_score).toBe(calculatedTotal);
        console.log(
          `✓ User rank ${standing.rank}: total_score=${standing.total_score}, calculated=${calculatedTotal}`
        );
      });
    });
  });
});
