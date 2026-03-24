import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ContestDetail } from "@/core/entities/contest.entity";
import { ContestOverview } from "./ContestOverview";

const downloadMyReportMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: {
    type: "3rdParty",
    init: () => {},
  },
}));

vi.mock("@/infrastructure/api/repositories", () => ({
  downloadMyReport: (...args: unknown[]) => downloadMyReportMock(...args),
}));

vi.mock("@/shared/layout/ContainerCard", () => ({
  default: () => <div data-testid="container-card" />,
}));

const createContest = (overrides: Partial<ContestDetail> = {}): ContestDetail =>
  ({
    id: "contest-1",
    name: "Contest",
    description: "",
    startTime: "2026-03-16T09:00:00.000Z",
    endTime: "2026-03-16T11:00:00.000Z",
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
    examStatus: "submitted",
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
    rules: "## Rules",
    ...overrides,
  }) as ContestDetail;

describe("ContestOverview", () => {
  it("renders sections without ContainerCard wrapper", () => {
    render(<ContestOverview contest={createContest()} maxWidth="1056px" />);

    expect(screen.getByText("overview.contestRules")).toBeInTheDocument();
    expect(screen.getByText("report.title")).toBeInTheDocument();
    expect(screen.queryByTestId("container-card")).not.toBeInTheDocument();
  });
});
