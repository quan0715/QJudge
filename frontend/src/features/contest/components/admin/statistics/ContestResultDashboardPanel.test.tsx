import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ContestDetail } from "@/core/entities/contest.entity";
import ContestResultDashboardPanel from "./ContestResultDashboardPanel";

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

vi.mock("@carbon/charts-react", () => ({
  SimpleBarChart: () => <div data-testid="score-distribution-chart" />,
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

  it("renders question preview cards in grid", () => {
    render(
      <MemoryRouter>
        <ContestResultDashboardPanel contest={buildContest()} />
      </MemoryRouter>,
    );

    expect(screen.getByText("基礎語法與觀念檢核")).toBeInTheDocument();
    expect(screen.getByText("多選：資料結構特性判斷")).toBeInTheDocument();
  });

  it("opens drawer when clicking a question card", () => {
    render(
      <MemoryRouter>
        <ContestResultDashboardPanel contest={buildContest()} />
      </MemoryRouter>,
    );

    const card = screen.getByText("基礎語法與觀念檢核").closest("button")!;
    fireEvent.click(card);

    expect(
      screen.getByText("Q1 · 基礎語法與觀念檢核"),
    ).toBeInTheDocument();
    expect(screen.getByText("選項分布")).toBeInTheDocument();
  });

  it("closes drawer on Escape key", () => {
    render(
      <MemoryRouter>
        <ContestResultDashboardPanel contest={buildContest()} />
      </MemoryRouter>,
    );

    const card = screen.getByText("基礎語法與觀念檢核").closest("button")!;
    fireEvent.click(card);
    expect(
      screen.getByText("Q1 · 基礎語法與觀念檢核"),
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByText("Q1 · 基礎語法與觀念檢核"),
    ).not.toBeInTheDocument();
  });

  it("renders questions sorted by order", () => {
    render(
      <MemoryRouter>
        <ContestResultDashboardPanel contest={buildContest()} />
      </MemoryRouter>,
    );

    const cards = screen.getAllByRole("button", { pressed: false });
    const firstCardText = cards[0]?.textContent ?? "";
    expect(firstCardText).toContain("Q1");
  });

  it("shows coding contests as summary-only", () => {
    render(
      <MemoryRouter>
        <ContestResultDashboardPanel
          contest={buildContest({ contestType: "coding" })}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByText("Coding 結果先保留基本資訊"),
    ).toBeInTheDocument();
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
    expect(screen.getByText("29 / 47")).toBeInTheDocument();
  });
});
