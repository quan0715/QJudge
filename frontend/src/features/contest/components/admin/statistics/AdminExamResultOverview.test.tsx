import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ContestDetail } from "@/core/entities/contest.entity";
import { createContestResultDashboardMock } from "./contestResultDashboard.mock";
import AdminExamResultOverview from "./AdminExamResultOverview";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      key: string,
      fallbackOrParams?: string | Record<string, unknown>,
      maybeParams?: Record<string, unknown>,
    ) => {
      const fallback =
        typeof fallbackOrParams === "string" ? fallbackOrParams : key;
      const params =
        typeof fallbackOrParams === "string" ? maybeParams : fallbackOrParams;
      if (!params) return fallback;
      return Object.entries(params).reduce(
        (acc, [paramKey, value]) =>
          acc.replace(`{{${paramKey}}}`, String(value)),
        fallback,
      );
    },
  }),
  initReactI18next: {
    type: "3rdParty",
    init: () => {},
  },
}));

vi.mock("@/shared/ui/theme/ThemeContext", () => ({
  useTheme: () => ({ theme: "white" }),
}));

const chartProps = vi.hoisted(() => ({
  lollipop: vi.fn(),
}));

vi.mock("@carbon/charts-react", () => ({
  LollipopChart: (props: unknown) => {
    chartProps.lollipop(props);
    return <div data-testid="score-distribution-chart" />;
  },
}));

const buildContest = (overrides: Partial<ContestDetail> = {}): ContestDetail =>
  ({
    id: "contest-1",
    name: "Operating Systems Exam",
    description: "",
    startTime: "2026-04-01T01:00:00.000Z",
    endTime: "2026-04-01T03:00:00.000Z",
    status: "published",
    visibility: "private",
    hasJoined: true,
    isRegistered: true,
    contestType: "paper_exam",
    deliveryMode: "exam",
    cheatDetectionEnabled: false,
    scoreboardVisibleDuringContest: false,
    allowMultipleJoins: false,
    maxCheatWarnings: 3,
    resultsPublished: false,
    examQuestionsCount: 0,
    isExamMonitored: false,
    requiresFullscreen: false,
    canSubmitExam: true,
    permissions: {
      canSwitchView: true,
      canEditContest: true,
      canToggleStatus: true,
      canDeleteContest: false,
      canPublishProblems: true,
      canViewAllSubmissions: true,
      canViewFullScoreboard: true,
      canManageClarifications: true,
    },
    problems: [],
    ...overrides,
  }) as ContestDetail;

describe("AdminExamResultOverview", () => {
  it("renders score distribution with average score header", () => {
    const contest = buildContest();
    const dashboard = createContestResultDashboardMock(contest);

    render(
      <AdminExamResultOverview
        contest={contest}
        dashboard={dashboard}
        loading={false}
        error={null}
      />,
    );

    expect(screen.getByLabelText("考試結果總覽")).toBeInTheDocument();
    expect(screen.queryByText("考試總覽")).not.toBeInTheDocument();
    expect(screen.getByText("71.8 / 100")).toBeInTheDocument();
    expect(screen.queryByText("74.0")).not.toBeInTheDocument();
    expect(screen.queryByText("92%")).not.toBeInTheDocument();
    expect(screen.queryByText("不及格率")).not.toBeInTheDocument();
    expect(screen.getByText("分數分布")).toBeInTheDocument();
    expect(screen.getByTestId("score-distribution-chart")).toBeInTheDocument();
    expect(chartProps.lollipop).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          color: expect.objectContaining({
            scale: expect.objectContaining({
              "50-59%": "var(--cds-support-error)",
              "60-69%": "var(--cds-link-primary)",
            }),
          }),
        }),
      }),
    );
  });

  it("does not render for coding contests", () => {
    const contest = buildContest({ contestType: "coding" });

    const { container } = render(
      <AdminExamResultOverview
        contest={contest}
        dashboard={null}
        loading={false}
        error={null}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
