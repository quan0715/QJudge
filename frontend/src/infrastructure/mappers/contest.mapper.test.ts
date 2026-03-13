import { describe, expect, it } from "vitest";
import { mapContestOverviewMetricsDto } from "./contest.mapper";

describe("contest mapper", () => {
  describe("mapContestOverviewMetricsDto", () => {
    it("maps overview metrics payload with heartbeat and time progress", () => {
      const dto = {
        online_now: 12,
        online_active_sessions: 15,
        exam: {
          status: "running",
          contest_type: "paper_exam",
        },
        time_progress: {
          total_seconds: 7200,
          elapsed_seconds: 1800,
          remaining_seconds: 5400,
          progress_percent: 25,
          is_started: true,
          is_ended: false,
        },
      };

      const result = mapContestOverviewMetricsDto(dto);

      expect(result.onlineNow).toBe(12);
      expect(result.onlineActiveSessions).toBe(15);
      expect(result.exam.status).toBe("running");
      expect(result.exam.contestType).toBe("paper_exam");
      expect(result.timeProgress.totalSeconds).toBe(7200);
      expect(result.timeProgress.progressPercent).toBe(25);
      expect(result.timeProgress.isStarted).toBe(true);
      expect(result.timeProgress.isEnded).toBe(false);
    });

    it("falls back to safe defaults when fields are missing", () => {
      const result = mapContestOverviewMetricsDto({});

      expect(result.onlineNow).toBe(0);
      expect(result.onlineActiveSessions).toBe(0);
      expect(result.exam.status).toBe("upcoming");
      expect(result.exam.contestType).toBe("coding");
      expect(result.timeProgress.totalSeconds).toBe(0);
      expect(result.timeProgress.elapsedSeconds).toBe(0);
      expect(result.timeProgress.remainingSeconds).toBe(0);
      expect(result.timeProgress.progressPercent).toBe(0);
      expect(result.timeProgress.isStarted).toBe(false);
      expect(result.timeProgress.isEnded).toBe(false);
    });
  });
});
