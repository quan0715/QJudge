import { describe, expect, it } from "vitest";
import {
  mapContestAnticheatConfigDto,
  mapContestDetailDto,
  mapContestOverviewMetricsDto,
  mapContestParticipantDto,
  mapContestUpdateRequestToDto,
} from "./contest.mapper";

describe("contest mapper", () => {
  describe("mapContestParticipantDto", () => {
    it("maps participant display name from profile display_name", () => {
      const result = mapContestParticipantDto({
        user_id: 1,
        username: "student1",
        display_name: "Student One",
        score: 0,
        joined_at: "2026-05-03T08:50:00+08:00",
        exam_status: "not_started",
        violation_count: 0,
      });

      expect(result.displayName).toBe("Student One");
      expect(result.username).toBe("student1");
    });
  });

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

  describe("anti-cheat recovery grace mapping", () => {
    it("maps contest detail screen share recovery grace from backend dto", () => {
      const result = mapContestDetailDto({
        id: "contest-1",
        name: "Exam",
        contest_type: "paper_exam",
        delivery_mode: "exam",
        cheat_detection_enabled: true,
        anticheat_device_policy: {},
        warning_timeout_seconds: 20,
        screen_share_recovery_grace_ms: 45000,
        permissions: {},
        problems: [],
        exam_questions_count: 0,
      });

      expect(result.screenShareRecoveryGraceMs).toBe(45000);
    });

    it("maps contest update payload screen share recovery grace to backend dto", () => {
      const dto = mapContestUpdateRequestToDto({
        screenShareRecoveryGraceMs: 45000,
      });

      expect(dto.screen_share_recovery_grace_ms).toBe(45000);
    });

    it("maps anticheat config contest/effective screen share recovery grace", () => {
      const result = mapContestAnticheatConfigDto({
        version: 1,
        global_defaults: {
          capture_interval_seconds: 5,
          forced_capture_cooldown_ms: 1000,
          forced_capture_p1_cooldown_ms: 15000,
          event_feed_aggregation_window_seconds: 60,
          incident_screenshot_window_before_ms: 15000,
          incident_screenshot_window_after_ms: 15000,
          incident_screenshot_preview_limit: 10,
          incident_screenshot_categories: ["critical"],
          monitoring_recovery_grace_ms: 3000,
          mouse_leave_cooldown_ms: 3000,
          screen_share_recovery_grace_ms: 30000,
          webcam_recovery_grace_ms: 10000,
          webcam_capture_interval_seconds: 10,
          multi_display_check_interval_ms: 5000,
          multi_display_report_cooldown_ms: 15000,
          presigned_url_ttl_seconds: 300,
        },
        contest_settings: {
          cheat_detection_enabled: true,
          allow_multiple_joins: true,
          max_cheat_warnings: 3,
          allow_auto_unlock: false,
          auto_unlock_minutes: 0,
          contest_type: "paper_exam",
          warning_timeout_seconds: 20,
          screen_share_recovery_grace_ms: 45000,
          anticheat_device_policy: {},
        },
        effective: {
          capture_interval_seconds: 5,
          forced_capture_cooldown_ms: 1000,
          forced_capture_p1_cooldown_ms: 15000,
          event_feed_aggregation_window_seconds: 60,
          incident_screenshot_window_before_ms: 15000,
          incident_screenshot_window_after_ms: 15000,
          incident_screenshot_preview_limit: 10,
          incident_screenshot_categories: ["critical"],
          monitoring_recovery_grace_ms: 3000,
          mouse_leave_cooldown_ms: 3000,
          screen_share_recovery_grace_ms: 45000,
          webcam_recovery_grace_ms: 10000,
          webcam_capture_interval_seconds: 10,
          multi_display_check_interval_ms: 5000,
          multi_display_report_cooldown_ms: 15000,
          presigned_url_ttl_seconds: 300,
          cheat_detection_enabled: true,
          allow_multiple_joins: true,
          max_cheat_warnings: 3,
          allow_auto_unlock: false,
          auto_unlock_minutes: 0,
          contest_type: "paper_exam",
          warning_timeout_seconds: 20,
          anticheat_device_policy: {},
        },
        device_policy: {},
        frontend_controlled_settings: {
          global: [],
          contest: [],
        },
      });

      expect(result.contestSettings.screenShareRecoveryGraceMs).toBe(45000);
      expect(result.effective.screenShareRecoveryGraceMs).toBe(45000);
    });
  });
});
