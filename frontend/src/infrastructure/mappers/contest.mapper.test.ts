import { describe, expect, it } from "vitest";
import {
  buildExamPaperSections,
  mapContestAnticheatConfigDto,
  mapContestDetailDto,
  mapContestOverviewMetricsDto,
  mapContestParticipantDto,
  mapContestUpdateRequestToDto,
  mapExamPaperDto,
  mapExamQuestionDto,
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
    it("drops retired contest delivery and warning fields", () => {
      const result = mapContestDetailDto({
        id: "contest-1",
        name: "Exam",
        delivery_mode: "practice",
        counts_toward_grade: false,
        max_cheat_warnings: 3,
        assignment_state: "accepted",
        accepted_at: "2026-07-11T09:00:00+08:00",
        submitted_at: "2026-07-11T10:00:00+08:00",
        permissions: {},
        problems: [],
      } as any);

      expect(result).not.toHaveProperty("deliveryMode");
      expect(result).not.toHaveProperty("countsTowardGrade");
      expect(result).not.toHaveProperty("maxCheatWarnings");
      expect(result).not.toHaveProperty("assignmentState");
      expect(result).not.toHaveProperty("acceptedAt");
      expect(result).not.toHaveProperty("submittedAt");

      const updateDto = mapContestUpdateRequestToDto({
        maxCheatWarnings: 3,
        countsTowardGrade: false,
      } as any);
      expect(updateDto).not.toHaveProperty("max_cheat_warnings");
      expect(updateDto).not.toHaveProperty("counts_toward_grade");
    });

    it("maps contest detail screen share recovery grace from backend payload", () => {
      const result = mapContestDetailDto({
        id: "contest-1",
        name: "Exam",
        contest_type: "paper_exam",
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

    it("omits contest update screen share recovery grace because backend owns it", () => {
      const dto = mapContestUpdateRequestToDto({
        screenShareRecoveryGraceMs: 45000,
      } as any);

      expect(dto).not.toHaveProperty("screen_share_recovery_grace_ms");
    });

    it("maps anticheat config screen share recovery grace from backend payload", () => {
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

      expect(result.globalDefaults.screenShareRecoveryGraceMs).toBe(30000);
      expect(result.contestSettings.screenShareRecoveryGraceMs).toBe(45000);
      expect(result.effective.screenShareRecoveryGraceMs).toBe(45000);
    });
  });

  describe("mapExamPaperDto", () => {
    it("maps groups, answer format, group membership, and frontend sections", () => {
      const result = mapExamPaperDto({
        groups: [
          {
            id: 7,
            contest: 3,
            title: "題組一",
            shared_stem_markdown: "已知 $f(x)=x^2$",
            order: 1,
            total_score: 12,
            created_at: "2026-05-12T09:00:00+08:00",
            updated_at: "2026-05-12T09:00:00+08:00",
          },
        ],
        questions: [
          {
            id: 11,
            contest: 3,
            question_type: "essay",
            prompt: "求極值",
            score: 6,
            order: 1,
            group_id: 7,
            order_in_group: 1,
            answer_format: "markdown_math",
          },
          {
            id: 12,
            contest: 3,
            question_type: "short_answer",
            prompt: "寫出答案",
            score: 6,
            order: 2,
            group_id: 7,
            order_in_group: 2,
            answer_format: "plain_text",
          },
          {
            id: 13,
            contest: 3,
            question_type: "single_choice",
            prompt: "獨立題",
            score: 2,
            order: 3,
          },
        ],
      });

      expect(result.groups[0]).toMatchObject({
        id: "7",
        contestId: "3",
        sharedStemMarkdown: "已知 $f(x)=x^2$",
        totalScore: 12,
      });
      expect(result.questions[0]).toMatchObject({
        id: "11",
        groupId: "7",
        orderInGroup: 1,
        answerFormat: "markdown_math",
      });
      expect(result.questions[2].answerFormat).toBe("plain_text");
      expect(result.sections).toEqual([
        {
          kind: "group",
          group: result.groups[0],
          items: [result.questions[0], result.questions[1]],
        },
        {
          kind: "flat",
          item: result.questions[2],
        },
      ]);
    });

    it("falls back to a flat section when a question references a missing group", () => {
      const question = mapExamQuestionDto({
        id: 11,
        contest: 3,
        question_type: "essay",
        prompt: "缺失題組",
        score: 6,
        order: 1,
        group_id: 99,
        answer_format: "markdown_math",
      });

      expect(buildExamPaperSections([question], [])).toEqual([
        {
          kind: "flat",
          item: question,
        },
      ]);
    });
  });
});
