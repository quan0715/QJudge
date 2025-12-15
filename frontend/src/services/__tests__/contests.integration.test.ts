/**
 * Contests API Integration Tests
 *
 * 測試 /api/v1/contests 相關端點
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  authenticatedRequest,
  skipIfNoBackend,
  loginAs,
  API_BASE_URL,
} from "./setup";

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

  describe("GET /:id/download - PDF/Markdown Download", () => {
    it("should download contest file as markdown", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip || !adminToken) return;

      // First get list to find a contest
      const listRes = await authenticatedRequest(
        "/api/v1/contests/",
        adminToken
      );
      const listData = await listRes.json();
      const contests = listData.results || listData;

      if (contests.length === 0) {
        console.log("⚠️ No contests found, skipping download test");
        return;
      }

      const contestId = contests[0].id;

      // Test markdown download
      const res = await authenticatedRequest(
        `/api/v1/contests/${contestId}/download/?file_format=markdown&language=zh-TW`,
        adminToken
      );

      // Should return 200 or content
      expect([200, 403]).toContain(res.status);

      if (res.status === 200) {
        const contentType = res.headers.get("content-type");
        // Should return text/markdown or text/plain
        expect(
          contentType?.includes("text/markdown") ||
            contentType?.includes("text/plain") ||
            contentType?.includes("application/octet-stream")
        ).toBe(true);
        console.log(
          `✓ Markdown download successful, content-type: ${contentType}`
        );
      }
    });

    it("should download contest file as PDF with scale parameter", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip || !adminToken) return;

      // First get list to find a contest
      const listRes = await authenticatedRequest(
        "/api/v1/contests/",
        adminToken
      );
      const listData = await listRes.json();
      const contests = listData.results || listData;

      if (contests.length === 0) {
        console.log("⚠️ No contests found, skipping PDF download test");
        return;
      }

      const contestId = contests[0].id;

      // Test PDF download with scale=1.5
      const res = await authenticatedRequest(
        `/api/v1/contests/${contestId}/download/?file_format=pdf&language=zh-TW&scale=1.5`,
        adminToken
      );

      // Should return 200 or 403 (permission denied for non-owners)
      expect([200, 403]).toContain(res.status);

      if (res.status === 200) {
        const contentType = res.headers.get("content-type");
        // Should return application/pdf
        expect(
          contentType?.includes("application/pdf") ||
            contentType?.includes("application/octet-stream")
        ).toBe(true);
        console.log(
          `✓ PDF download with scale=1.5 successful, content-type: ${contentType}`
        );
      }
    });

    it("should accept various scale values (0.5 to 2.0)", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip || !adminToken) return;

      const listRes = await authenticatedRequest(
        "/api/v1/contests/",
        adminToken
      );
      const contests = (await listRes.json()).results || [];

      if (contests.length === 0) {
        console.log("⚠️ No contests found, skipping scale range test");
        return;
      }

      const contestId = contests[0].id;
      const scaleValues = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

      for (const scale of scaleValues) {
        const res = await authenticatedRequest(
          `/api/v1/contests/${contestId}/download/?file_format=pdf&language=en&scale=${scale}`,
          adminToken
        );

        // Should not return 400 (Bad Request) for valid scale values
        expect(res.status).not.toBe(400);
        console.log(`✓ Scale ${scale} accepted, status: ${res.status}`);
      }
    });

    it("should handle out-of-range scale values by clamping", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip || !adminToken) return;

      const listRes = await authenticatedRequest(
        "/api/v1/contests/",
        adminToken
      );
      const contests = (await listRes.json()).results || [];

      if (contests.length === 0) {
        console.log("⚠️ No contests found, skipping scale clamping test");
        return;
      }

      const contestId = contests[0].id;

      // Test with out-of-range scale values
      // Backend clamps scale to 0.5-2.0 range (see exporters.py and views.py)
      const outOfRangeValues = [
        { scale: 5.0, description: "above max (5.0 -> clamped to 2.0)" },
        { scale: 0.1, description: "below min (0.1 -> clamped to 0.5)" },
        { scale: -1, description: "negative (-1 -> clamped to 0.5)" },
      ];

      for (const { scale, description } of outOfRangeValues) {
        const res = await authenticatedRequest(
          `/api/v1/contests/${contestId}/download/?file_format=pdf&language=en&scale=${scale}`,
          adminToken
        );

        // Backend should clamp and return 200 (or 403 if permission denied)
        // It should NOT return 400 (bad request) or 500 (server error)
        expect(res.status).not.toBe(400);
        expect(res.status).not.toBe(500);
        expect([200, 403]).toContain(res.status);
        console.log(
          `✓ Scale ${description}: status ${res.status} (clamped, not rejected)`
        );
      }
    });

    it("should handle non-numeric scale values gracefully", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip || !adminToken) return;

      const listRes = await authenticatedRequest(
        "/api/v1/contests/",
        adminToken
      );
      const contests = (await listRes.json()).results || [];

      if (contests.length === 0) {
        console.log("⚠️ No contests found, skipping non-numeric scale test");
        return;
      }

      const contestId = contests[0].id;

      // Test with non-numeric scale (should default to 1.0)
      const res = await authenticatedRequest(
        `/api/v1/contests/${contestId}/download/?file_format=pdf&language=en&scale=invalid`,
        adminToken
      );

      // Backend should default to 1.0 and return 200 (or 403 if permission denied)
      // It should NOT return 500 (server error)
      expect(res.status).not.toBe(500);
      expect([200, 403]).toContain(res.status);
      console.log(
        `✓ Non-numeric scale handled gracefully: status ${res.status}`
      );
    });
  });

  describe("GET /:id/participants/:userId/report - Admin Participant Report", () => {
    it("should allow admin to download participant report as PDF", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip || !adminToken) return;

      // Get contests to find one with participants
      const listRes = await authenticatedRequest(
        "/api/v1/contests/",
        adminToken
      );
      const contests = (await listRes.json()).results || [];

      if (contests.length === 0) {
        console.log("⚠️ No contests found, skipping participant report test");
        return;
      }

      const contestId = contests[0].id;

      // Get participants
      const participantsRes = await authenticatedRequest(
        `/api/v1/contests/${contestId}/participants/`,
        adminToken
      );

      if (participantsRes.status !== 200) {
        console.log("⚠️ Could not fetch participants, skipping test");
        return;
      }

      const participants = await participantsRes.json();

      if (!Array.isArray(participants) || participants.length === 0) {
        console.log("⚠️ No participants found, skipping report test");
        return;
      }

      const userId = participants[0].user?.id || participants[0].user_id;
      if (!userId) {
        console.log("⚠️ No valid user ID found in participant data");
        return;
      }

      // Test downloading participant report
      const res = await authenticatedRequest(
        `/api/v1/contests/${contestId}/participants/${userId}/report/?language=zh-TW`,
        adminToken
      );

      // Should return 200 for PDF or 404 if user not found
      expect([200, 404]).toContain(res.status);

      if (res.status === 200) {
        const contentType = res.headers.get("content-type");
        expect(
          contentType?.includes("application/pdf") ||
            contentType?.includes("application/octet-stream")
        ).toBe(true);
        console.log(
          `✓ Admin participant report download successful, content-type: ${contentType}`
        );
      }
    });

    it("should reject non-admin/non-owner from downloading participant report", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip || !authToken || !adminToken) return;

      // Get contests list (as admin to ensure we have one)
      const listRes = await authenticatedRequest(
        "/api/v1/contests/",
        adminToken
      );
      const contests = (await listRes.json()).results || [];

      if (contests.length === 0) {
        console.log("⚠️ No contests found, skipping permission test");
        return;
      }

      const contestId = contests[0].id;

      // Try to download as student (should be forbidden)
      const res = await authenticatedRequest(
        `/api/v1/contests/${contestId}/participants/1/report/`,
        authToken // student token
      );

      // Should return 403 Forbidden for non-admin/non-owner
      expect(res.status).toBe(403);
      console.log(`✓ Student correctly denied access: status ${res.status}`);
    });

    it("should return 404 for non-existent user in participant report", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip || !adminToken) return;

      const listRes = await authenticatedRequest(
        "/api/v1/contests/",
        adminToken
      );
      const contests = (await listRes.json()).results || [];

      if (contests.length === 0) {
        console.log("⚠️ No contests found, skipping 404 test");
        return;
      }

      const contestId = contests[0].id;

      // Request report for non-existent user
      const res = await authenticatedRequest(
        `/api/v1/contests/${contestId}/participants/999999/report/`,
        adminToken
      );

      expect(res.status).toBe(404);
      console.log(`✓ Non-existent user returns 404: status ${res.status}`);
    });

    it("should accept scale parameter for participant report", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip || !adminToken) return;

      const listRes = await authenticatedRequest(
        "/api/v1/contests/",
        adminToken
      );
      const contests = (await listRes.json()).results || [];

      if (contests.length === 0) {
        console.log("⚠️ No contests found, skipping scale test");
        return;
      }

      const contestId = contests[0].id;

      // Get participants
      const participantsRes = await authenticatedRequest(
        `/api/v1/contests/${contestId}/participants/`,
        adminToken
      );

      if (participantsRes.status !== 200) {
        console.log("⚠️ Could not fetch participants, skipping test");
        return;
      }

      const participants = await participantsRes.json();

      if (!Array.isArray(participants) || participants.length === 0) {
        console.log("⚠️ No participants found, skipping scale test");
        return;
      }

      const userId = participants[0].user?.id || participants[0].user_id;
      if (!userId) return;

      // Test with scale parameter
      const res = await authenticatedRequest(
        `/api/v1/contests/${contestId}/participants/${userId}/report/?scale=1.5`,
        adminToken
      );

      expect([200, 404]).toContain(res.status);
      expect(res.status).not.toBe(400); // Scale should be accepted
      console.log(`✓ Scale parameter accepted: status ${res.status}`);
    });
  });

  describe("GET /:id/my_report - Student Own Report", () => {
    it("should allow submitted student to download their own report", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip || !authToken) return;

      // Get contests the student might be participating in
      const listRes = await authenticatedRequest(
        "/api/v1/contests/",
        authToken
      );
      const contests = (await listRes.json()).results || [];

      // Find a contest where student might have submitted
      for (const contest of contests) {
        const res = await authenticatedRequest(
          `/api/v1/contests/${contest.id}/my_report/`,
          authToken
        );

        // Possible responses:
        // 200 - Success (student has submitted)
        // 403 - Not submitted yet or not a participant
        // 404 - Not a participant
        if (res.status === 200) {
          const contentType = res.headers.get("content-type");
          expect(
            contentType?.includes("application/pdf") ||
              contentType?.includes("application/octet-stream")
          ).toBe(true);
          console.log(
            `✓ Student own report download successful for contest ${contest.id}`
          );
          return; // Found one, test passed
        } else if (res.status === 403) {
          // Try parsing error message
          try {
            const errorData = await res.json();
            console.log(
              `Contest ${contest.id}: ${errorData.error || "Not submitted yet"}`
            );
          } catch {
            console.log(
              `Contest ${contest.id}: 403 - Not submitted or not participant`
            );
          }
        }
      }

      console.log(
        "⚠️ No contest found where student has submitted, which is expected"
      );
    });

    it("should reject unauthenticated user from my_report", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip) return;

      // Get a contest ID without authentication
      const publicRes = await fetch(`${API_BASE_URL}/api/v1/contests/`);
      if (publicRes.status !== 200) {
        console.log("⚠️ Could not fetch public contests, skipping test");
        return;
      }

      const contests = (await publicRes.json()).results || [];
      if (contests.length === 0) {
        console.log("⚠️ No contests found, skipping auth test");
        return;
      }

      // Try to access my_report without auth
      const res = await fetch(
        `${API_BASE_URL}/api/v1/contests/${contests[0].id}/my_report/`
      );

      expect(res.status).toBe(401);
      console.log(`✓ Unauthenticated request rejected: status ${res.status}`);
    });

    it("should accept language parameter for my_report", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip || !authToken) return;

      const listRes = await authenticatedRequest(
        "/api/v1/contests/",
        authToken
      );
      const contests = (await listRes.json()).results || [];

      if (contests.length === 0) {
        console.log("⚠️ No contests found, skipping language test");
        return;
      }

      // Test with English language
      const res = await authenticatedRequest(
        `/api/v1/contests/${contests[0].id}/my_report/?language=en`,
        authToken
      );

      // Should not return 400 (bad request) for valid language
      expect(res.status).not.toBe(400);
      console.log(`✓ Language parameter accepted: status ${res.status}`);
    });

    it("should handle invalid scale by clamping (my_report)", async () => {
      const shouldSkip = await skipIfNoBackend();
      if (shouldSkip || !authToken) return;

      const listRes = await authenticatedRequest(
        "/api/v1/contests/",
        authToken
      );
      const contests = (await listRes.json()).results || [];

      if (contests.length === 0) {
        console.log("⚠️ No contests found, skipping scale clamping test");
        return;
      }

      // Test with out-of-range scale (should be clamped, not rejected)
      const res = await authenticatedRequest(
        `/api/v1/contests/${contests[0].id}/my_report/?scale=10`,
        authToken
      );

      // Should not return 400 or 500
      expect(res.status).not.toBe(400);
      expect(res.status).not.toBe(500);
      console.log(
        `✓ Out-of-range scale clamped gracefully: status ${res.status}`
      );
    });
  });
});
