import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ContestDetail } from "@/core/entities/contest.entity";
import { createContestResultDashboardMock } from "./contestResultDashboard.mock";
import AdminQuestionStatsGallery from "./AdminQuestionStatsGallery";

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

describe("AdminQuestionStatsGallery", () => {
  it("renders question answer data cards from the result dashboard", async () => {
    const contest = buildContest();
    const loadQuestionDetail = vi.fn();
    const dashboard = createContestResultDashboardMock(contest);

    render(
      <AdminQuestionStatsGallery
        contest={contest}
        dashboard={dashboard}
        loading={false}
        error={null}
        loadQuestionDetail={loadQuestionDetail}
        detailLoadingIds={{}}
        detailErrors={{}}
      />,
    );

    expect(screen.getByLabelText("各題作答數據")).toBeInTheDocument();
    expect(screen.getByText("8 題")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "關注數據" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "得分率" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("申論：程序與執行緒差異")).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "搜尋題目" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "篩選題型" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("得分率").length).toBeGreaterThan(0);
    expect(screen.getAllByText("47 人作答").length).toBeGreaterThan(0);
    expect(screen.queryByText("批改率")).not.toBeInTheDocument();
    expect(screen.queryByText("正答率")).not.toBeInTheDocument();
    expect(screen.queryByText("待觀察")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "未作答率" }));

    expect(screen.getByRole("button", { name: "未作答率" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getAllByText("未作答率").length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("progressbar", { name: "未作答率" }).length,
    ).toBeGreaterThan(0);

    await userEvent.type(
      screen.getByRole("searchbox", { name: "搜尋題目" }),
      "Q3",
    );

    expect(screen.getByText("簡答：演算法複雜度說明")).toBeInTheDocument();
    expect(
      screen.queryByText("申論：程序與執行緒差異"),
    ).not.toBeInTheDocument();

    await userEvent.clear(screen.getByRole("searchbox", { name: "搜尋題目" }));
    await userEvent.click(
      screen.getByText("申論：程序與執行緒差異").closest("button")!,
    );

    expect(
      screen.getByRole("dialog", { name: "Q2 作答數據" }),
    ).toBeInTheDocument();
    expect(screen.getByText("批改進度")).toBeInTheDocument();
    expect(screen.getByText("29 / 47")).toBeInTheDocument();
    expect(loadQuestionDetail).toHaveBeenCalledWith("q2");

    await userEvent.click(
      screen.getByRole("button", { name: "關閉題目作答數據" }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Q2 作答數據" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("does not render for coding contests", () => {
    const contest = buildContest({ contestType: "coding" });

    const { container } = render(
      <AdminQuestionStatsGallery
        contest={contest}
        dashboard={null}
        loading={false}
        error={null}
        loadQuestionDetail={vi.fn()}
        detailLoadingIds={{}}
        detailErrors={{}}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
