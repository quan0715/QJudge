import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContestDetail } from "@/core/entities/contest.entity";
import ContestResultDashboardPanel from "./ContestResultDashboardPanel";
import { useContestResultDashboard } from "./useContestResultDashboard";
import { createContestResultDashboardMock } from "./contestResultDashboard.mock";

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

vi.mock("@carbon/charts-react", () => ({
  LollipopChart: () => <div data-testid="score-distribution-chart" />,
  SimpleBarChart: () => <div data-testid="drawer-distribution-chart" />,
}));

vi.mock("./useContestResultDashboard", () => ({
  useContestResultDashboard: vi.fn(),
}));

const buildContest = (
  overrides: Partial<ContestDetail> = {},
): ContestDetail =>
  ({
    id: "contest-1",
    name: "Algorithms Midterm",
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
    allowAutoUnlock: false,
    autoUnlockMinutes: 0,
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

describe("ContestResultDashboardPanel", () => {
  beforeEach(() => {
    vi.mocked(useContestResultDashboard).mockReturnValue({
      data: createContestResultDashboardMock(buildContest()),
      loading: false,
      error: null,
      loadQuestionDetail: vi.fn(),
      detailLoadingIds: {},
      detailErrors: {},
    });
  });

  it("renders KPI cards and score distribution chart", () => {
    render(
      <MemoryRouter>
        <ContestResultDashboardPanel contest={buildContest()} />
      </MemoryRouter>,
    );

    expect(screen.getByText("71.8 / 100")).toBeInTheDocument();
    expect(screen.getByText("74")).toBeInTheDocument();
    expect(screen.getByText("92%")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.getByTestId("score-distribution-chart")).toBeInTheDocument();
  });

  it("renders question preview cards with rate bar", () => {
    render(
      <MemoryRouter>
        <ContestResultDashboardPanel contest={buildContest()} />
      </MemoryRouter>,
    );

    expect(screen.getByText("基礎語法與觀念檢核")).toBeInTheDocument();
    expect(screen.getAllByText("得分率").length).toBeGreaterThan(0);
  });

  it("opens drawer when clicking a question card", () => {
    render(
      <MemoryRouter>
        <ContestResultDashboardPanel contest={buildContest()} />
      </MemoryRouter>,
    );

    const card = screen.getByText("基礎語法與觀念檢核").closest("button")!;
    fireEvent.click(card);

    expect(screen.getByText("Q1 ·")).toBeInTheDocument();
    expect(screen.getByText("選項分布")).toBeInTheDocument();
    expect(screen.getByText("所有作答")).toBeInTheDocument();
    expect(screen.queryByText(/作答學生/)).not.toBeInTheDocument();
    expect(screen.queryByText("所有回答")).not.toBeInTheDocument();
  });

  it("filters objective participant list by selected option", () => {
    render(
      <MemoryRouter>
        <ContestResultDashboardPanel contest={buildContest()} />
      </MemoryRouter>,
    );

    const card = screen.getByText("基礎語法與觀念檢核").closest("button")!;
    fireEvent.click(card);

    expect(screen.getByText("Amy")).toBeInTheDocument();
    expect(screen.getByText("ben")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "A 1" }));

    expect(screen.getByText("ben")).toBeInTheDocument();
    expect(screen.queryByText("Amy")).not.toBeInTheDocument();
  });

  it("closes drawer on Escape key", () => {
    render(
      <MemoryRouter>
        <ContestResultDashboardPanel contest={buildContest()} />
      </MemoryRouter>,
    );

    const card = screen.getByText("基礎語法與觀念檢核").closest("button")!;
    fireEvent.click(card);
    expect(screen.getByText("選項分布")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("選項分布")).not.toBeInTheDocument();
  });

  it("renders questions sorted by score rate", () => {
    render(
      <MemoryRouter>
        <ContestResultDashboardPanel contest={buildContest()} />
      </MemoryRouter>,
    );

    const cards = screen.getAllByRole("button", { pressed: false });
    const firstCardText = cards[0]?.textContent ?? "";
    expect(firstCardText).toContain("Q2");
  });

  it("shows not supported message for coding contests", () => {
    vi.mocked(useContestResultDashboard).mockReturnValue({
      data: null,
      loading: false,
      error: null,
      loadQuestionDetail: vi.fn(),
      detailLoadingIds: {},
      detailErrors: {},
    });
    render(
      <MemoryRouter>
        <ContestResultDashboardPanel
          contest={buildContest({ contestType: "coding" })}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByText("目前不支援 Coding 考試的結果分析"),
    ).toBeInTheDocument();
  });

  it("shows loading state", () => {
    vi.mocked(useContestResultDashboard).mockReturnValue({
      data: null,
      loading: true,
      error: null,
      loadQuestionDetail: vi.fn(),
      detailLoadingIds: {},
      detailErrors: {},
    });
    render(
      <MemoryRouter>
        <ContestResultDashboardPanel contest={buildContest()} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("dashboard-skeleton")).toBeInTheDocument();
  });

  it("shows grading progress for essay questions in drawer", () => {
    render(
      <MemoryRouter>
        <ContestResultDashboardPanel contest={buildContest()} />
      </MemoryRouter>,
    );

    const card = screen
      .getByText("申論：程序與執行緒差異")
      .closest("button")!;
    fireEvent.click(card);

    expect(screen.getByText("批改進度")).toBeInTheDocument();
    expect(screen.getAllByText("29 / 47").length).toBeGreaterThan(0);
  });

  it("calls loadQuestionDetail when opening drawer", () => {
    const loadQuestionDetail = vi.fn();
    vi.mocked(useContestResultDashboard).mockReturnValue({
      data: createContestResultDashboardMock(buildContest()),
      loading: false,
      error: null,
      loadQuestionDetail,
      detailLoadingIds: {},
      detailErrors: {},
    });

    render(
      <MemoryRouter>
        <ContestResultDashboardPanel contest={buildContest()} />
      </MemoryRouter>,
    );

    const card = screen.getByText("基礎語法與觀念檢核").closest("button")!;
    fireEvent.click(card);

    expect(loadQuestionDetail).toHaveBeenCalled();
  });
});
