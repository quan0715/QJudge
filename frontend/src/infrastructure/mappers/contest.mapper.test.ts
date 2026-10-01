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
  it("keeps only the computed question lock boolean", () => {
    const result = mapContestDetailDto({
      id: "contest-1",
      name: "Exam",
      question_edit_locked: true,
      question_edit_locked_at: "2026-08-10T12:00:00+08:00",
      question_edit_lock_trigger: "exam_started",
      permissions: {},
      problems: [],
    } as any);

    expect(result.questionEditLocked).toBe(true);
    expect(result).not.toHaveProperty("questionEditLockedAt");
    expect(result).not.toHaveProperty("questionEditLockTrigger");
  });

  it("normalizes contest problem score aliases to maxScore", () => {
    const result = mapContestDetailDto({
      id: "contest-1",
      name: "Exam",
      permissions: {},
      problems: [
        {
          id: "binding-1",
          problem_id: "problem-1",
          title: "Two Sum",
          score: 100,
        },
      ],
    } as any);

    expect(result.problems[0]).toMatchObject({ maxScore: 100 });
    expect(result.problems[0]).not.toHaveProperty("score");
  });

  describe("mapContestParticipantDto", () => {
    it("maps participant display name from profile display_name", () => {
      const result = mapContestParticipantDto({
        user_id: 1,
        username: "student1",
        display_name: "Student One",
        total_score: 0,
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

  describe("anti-cheat config mapping", () => {
    it("maps webcamRequired from the config and from the frozen run separately", () => {
      const config = mapContestAnticheatConfigDto({
        webcam_required: true,
        integrity_run: {
          id: "run-1",
          session_state: "active",
          health: "healthy",
          participant_id: "7",
          policy_snapshot: { webcam_required: false },
          registry_snapshot: { version: "registry-1", definitions: {} },
        },
      });

      expect(config.webcamRequired).toBe(true);
      expect(config.integrityRun?.participantId).toBe(7);
      expect(config.integrityRun?.webcamRequired).toBe(false);
    });

    it("maps webcamRequired on contest detail and updates", () => {
      expect(
        mapContestDetailDto({
          id: "contest-1",
          name: "Exam",
          webcam_required: true,
          permissions: {},
          problems: [],
        } as any).webcamRequired,
      ).toBe(true);
      expect(mapContestUpdateRequestToDto({ webcamRequired: true })).toEqual({
        webcam_required: true,
      });
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
