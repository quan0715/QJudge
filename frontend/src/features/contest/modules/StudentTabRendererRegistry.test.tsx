import { describe, expect, it, vi } from "vitest";
import { isValidElement } from "react";
import { codingContestModule } from "@/features/contest/modules/CodingModule";
import type { ContestDetail, ScoreboardRow } from "@/core/entities/contest.entity";
import type { ContestTypeModule } from "@/features/contest/modules/types";
import { resolveStudentTabRenderer } from "@/features/contest/modules/StudentTabRendererRegistry";

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

const createMyRank = (): ScoreboardRow => ({
  userId: "u1",
  displayName: "student",
  solvedCount: 0,
  totalScore: 0,
  penalty: 0,
  rank: 1,
  problems: {},
});

describe("student tab renderer registry", () => {
  it("resolves default renderer by content kind", () => {
    const renderer = resolveStudentTabRenderer(codingContestModule, "coding_problems");
    const view = renderer({
      contest: createContest(),
      myRank: createMyRank(),
      maxWidth: "1056px",
    });

    expect(isValidElement(view)).toBe(true);
  });

  it("prefers module override renderer", () => {
    const override = vi.fn(() => <div data-testid="override" />);
    const moduleWithOverride: ContestTypeModule = {
      ...codingContestModule,
      student: {
        ...codingContestModule.student,
        getTabRenderers: () => ({
          overview: override,
        }),
      },
    };

    const renderer = resolveStudentTabRenderer(moduleWithOverride, "overview");
    const view = renderer({
      contest: createContest(),
      myRank: null,
      maxWidth: "1056px",
    });

    expect(renderer).toBe(override);
    expect(isValidElement(view)).toBe(true);
  });
});
