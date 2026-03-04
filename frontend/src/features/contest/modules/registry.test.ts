import { describe, expect, it } from "vitest";
import { getContestTypeModule } from "@/features/contest/modules/registry";
import type { ContestDetail } from "@/core/entities/contest.entity";

const createContest = (overrides: Partial<ContestDetail> = {}): ContestDetail =>
  ({
    id: "contest-1",
    name: "Contest",
    description: "",
    startTime: "",
    endTime: "",
    status: "published",
    visibility: "public",
    hasJoined: true,
    isRegistered: true,
    contestType: "coding",
    cheatDetectionEnabled: true,
    scoreboardVisibleDuringContest: false,
    allowMultipleJoins: false,
    maxCheatWarnings: 3,
    allowAutoUnlock: false,
    autoUnlockMinutes: 0,
    resultsPublished: false,
    examQuestionsCount: 0,
    permissions: {
      canSwitchView: true,
      canEditContest: false,
      canToggleStatus: false,
      canDeleteContest: false,
      canPublishProblems: false,
      canViewAllSubmissions: false,
      canViewFullScoreboard: false,
      canManageClarifications: false,
    },
    problems: [],
    ...overrides,
  }) as ContestDetail;

describe("contest type module registry", () => {
  it("returns coding module by default", () => {
    const module = getContestTypeModule(undefined);
    expect(module.type).toBe("coding");
    expect(module.admin.editorKind).toBe("coding");
    expect(module.admin.getExportTargets()).toEqual([
      "coding-pdf",
      "coding-markdown",
    ]);
    expect(module.admin.getAvailablePanels()).toEqual([
      "overview",
      "clarifications",
      "logs",
      "participants",
      "problem_editor",
      "grading",
      "statistics",
      "settings",
    ]);
    expect(module.admin.isFullBleedPanel("problem_editor")).toBe(true);
    expect(module.admin.isFullBleedPanel("overview")).toBe(false);
  });

  it("returns paper exam module for paper_exam contests", () => {
    const module = getContestTypeModule("paper_exam");
    expect(module.type).toBe("paper_exam");
    expect(module.admin.editorKind).toBe("paper_exam");
    expect(module.admin.getExportTargets()).toEqual([
      "exam-question",
      "exam-answer",
      "exam-json",
    ]);
    expect(module.admin.shouldShowJsonActions("problem_editor")).toBe(true);
    expect(module.admin.shouldShowJsonActions("overview")).toBe(false);
  });

  it("lets modules decide answering entry path", () => {
    const codingModule = getContestTypeModule("coding");
    const paperModule = getContestTypeModule("paper_exam");

    const codingContest = createContest({
      contestType: "coding",
      problems: [
        { id: "2", problemId: "p2", label: "B", title: "P2", order: 2, score: 100 },
        { id: "1", problemId: "p1", label: "A", title: "P1", order: 1, score: 100 },
      ],
    });

    expect(codingModule.student.getAnsweringEntryPath("42", codingContest)).toBe(
      "/contests/42/solve/p1",
    );
    expect(paperModule.student.getAnsweringEntryPath("42", createContest({ contestType: "paper_exam" }))).toBe(
      "/contests/42/paper-exam/answering",
    );
  });

  it("keeps coding tab visibility rules", () => {
    const module = getContestTypeModule("coding");
    const beforeStart = createContest({
      contestType: "coding",
      hasStarted: false,
      examStatus: "not_started",
    });
    const inProgress = createContest({
      contestType: "coding",
      hasStarted: true,
      examStatus: "in_progress",
    });

    expect(module.student.getTabs(beforeStart).map((tab) => tab.key)).toEqual([
      "overview",
      "submissions",
    ]);
    expect(module.student.getTabs(inProgress).map((tab) => tab.key)).toEqual([
      "overview",
      "problems",
      "submissions",
      "clarifications",
    ]);
    const problemsTab = module.student.getTabs(inProgress).find((tab) => tab.key === "problems");
    expect(problemsTab?.contentKind).toBe("coding_problems");
  });

  it("keeps paper-exam tab visibility rules", () => {
    const module = getContestTypeModule("paper_exam");
    const beforeStart = createContest({
      contestType: "paper_exam",
      hasStarted: false,
      examStatus: "not_started",
    });
    const inProgress = createContest({
      contestType: "paper_exam",
      hasStarted: true,
      examStatus: "in_progress",
    });

    expect(module.student.getTabs(beforeStart).map((tab) => tab.key)).toEqual([
      "overview",
    ]);
    expect(module.student.getTabs(inProgress).map((tab) => tab.key)).toEqual([
      "overview",
      "problems",
      "clarifications",
    ]);
    const problemsTab = module.student.getTabs(inProgress).find((tab) => tab.key === "problems");
    expect(problemsTab?.contentKind).toBe("paper_exam_problems");
  });
});
