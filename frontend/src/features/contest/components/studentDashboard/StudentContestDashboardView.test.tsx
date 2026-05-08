import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChangeEventHandler, ReactNode } from "react";
import type {
  ContestDetail,
} from "@/core/entities/contest.entity";
import { getExamQuestions } from "@/infrastructure/api/repositories/examQuestions.repository";
import {
  getExamResults,
  getMyExamAnswers,
} from "@/infrastructure/api/repositories/examAnswers.repository";
import { getExamDashboardSummary } from "@/infrastructure/api/repositories/exam.repository";
import { getContestAnnouncements } from "@/infrastructure/api/repositories/contestAnnouncements.repository";
import StudentContestDashboard from "./StudentContestDashboardView";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
  initReactI18next: {
    type: "3rdParty",
    init: () => {},
  },
}));

vi.mock("@carbon/react", () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  InlineNotification: ({
    title,
    subtitle,
  }: {
    title: ReactNode;
    subtitle: ReactNode;
  }) => (
    <div>
      <span>{title}</span>
      <span>{subtitle}</span>
    </div>
  ),
  Modal: ({
    open,
    children,
  }: {
    open: boolean;
    children: ReactNode;
  }) => (open ? <div role="dialog">{children}</div> : null),
  Select: ({
    children,
    value,
    onChange,
  }: {
    children: ReactNode;
    value: string;
    onChange?: ChangeEventHandler<HTMLSelectElement>;
  }) => (
    <select value={value} onChange={onChange}>
      {children}
    </select>
  ),
  SelectItem: ({ value, text }: { value: string; text: string }) => (
    <option value={value}>{text}</option>
  ),
  ProgressBar: ({ value }: { value: number }) => (
    <div data-testid="progress-bar" data-value={value} />
  ),
  SkeletonPlaceholder: () => <div data-testid="skeleton-placeholder" />,
  Tab: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  TabList: ({
    children,
    ...props
  }: {
    children: ReactNode;
    "aria-label"?: string;
  }) => (
    <div role="tablist" aria-label={props["aria-label"]}>
      {children}
    </div>
  ),
  TabPanel: ({ children }: { children: ReactNode }) => (
    <div role="tabpanel">{children}</div>
  ),
  TabPanels: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Tabs: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Tag: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  TextInput: () => <input aria-label="text input" />,
}));

vi.mock("@carbon/charts-react", () => ({
  LollipopChart: () => <div data-testid="score-distribution-chart" />,
}));

vi.mock("@/shared/ui/theme/ThemeContext", () => ({
  useTheme: () => ({ theme: "white" }),
}));

vi.mock("@carbon/icons-react", () => {
  const Icon = () => <span aria-hidden="true" />;
  return {
    Checkmark: Icon,
    Document: Icon,
    Flag: Icon,
    Launch: Icon,
    Login: Icon,
    Play: Icon,
    Renew: Icon,
    Time: Icon,
    WarningAlt: Icon,
  };
});

vi.mock("@/shared/ui/markdown/MarkdownRenderer", () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));

vi.mock("@/features/contest/components/modals/ContestRegistrationModal", () => ({
  ContestRegistrationModal: ({ open }: { open: boolean }) =>
    open ? <div>registration modal</div> : null,
}));

vi.mock("@/infrastructure/api/repositories", () => ({
  downloadMyReport: vi.fn(),
}));

vi.mock("@/infrastructure/api/repositories/examQuestions.repository", () => ({
  getExamQuestions: vi.fn(async () => []),
}));

vi.mock("@/infrastructure/api/repositories/examAnswers.repository", () => ({
  getExamResults: vi.fn(async () => []),
  getMyExamAnswers: vi.fn(async () => []),
}));

vi.mock("@/infrastructure/api/repositories/exam.repository", () => ({
  getExamDashboardSummary: vi.fn(async () => ({
    contest: {
      id: "contest-1",
      name: "測試競賽",
      course: "",
      contest_type: "paper_exam",
      participant_count: 2,
      completed_count: 2,
      results_published: true,
    },
    summary: {
      average_score: 75,
      median_score: 75,
      max_total_score: 100,
    },
    score_distribution: [
      { range_label: "0-9%", count: 0 },
      { range_label: "10-19%", count: 0 },
      { range_label: "20-29%", count: 0 },
      { range_label: "30-39%", count: 0 },
      { range_label: "40-49%", count: 0 },
      { range_label: "50-59%", count: 1 },
      { range_label: "60-69%", count: 0 },
      { range_label: "70-79%", count: 1 },
      { range_label: "80-89%", count: 0 },
      { range_label: "90-100%", count: 0 },
    ],
    questions: [],
  })),
}));

vi.mock("@/infrastructure/api/repositories/contestAnnouncements.repository", () => ({
  getContestAnnouncements: vi.fn(() => new Promise(() => {})),
}));

const createContest = (
  overrides: Partial<ContestDetail> = {},
): ContestDetail =>
  ({
    id: "contest-1",
    name: "測試競賽",
    description: "競賽說明",
    startTime: "2099-05-05T10:00:00.000Z",
    endTime: "2099-05-05T12:00:00.000Z",
    status: "published",
    visibility: "public",
    hasJoined: true,
    isRegistered: true,
    contestType: "coding",
    deliveryMode: "exam",
    countsTowardGrade: true,
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
    examStatus: "not_started",
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
    problems: [
      {
        id: "binding-1",
        problemId: "problem-1",
        label: "A",
        title: "Two Sum",
        score: 50,
        maxScore: 50,
      },
    ],
    rules: "規則",
    ...overrides,
  }) as ContestDetail;

const renderDashboard = (
  contest: ContestDetail,
) =>
  render(
    <MemoryRouter>
      <StudentContestDashboard
        contest={contest}
      />
    </MemoryRouter>,
  );

const renderDashboardAtContestRoute = (
  contest: ContestDetail,
) =>
  render(
    <MemoryRouter initialEntries={["/classrooms/classroom-1/contest/contest-1"]}>
      <Routes>
        <Route
          path="/classrooms/:classroomId/contest/:contestId"
          element={<StudentContestDashboard contest={contest} />}
        />
      </Routes>
    </MemoryRouter>,
  );

describe("StudentContestDashboard", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders pre-exam join state inside the dashboard", () => {
    renderDashboard(
      createContest({
        hasJoined: false,
        isRegistered: false,
      }),
    );

    expect(screen.getByRole("main", { name: "學生競賽首頁" })).toBeInTheDocument();
    expect(screen.getByText("總時長")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /加入競賽/ })).toBeInTheDocument();
  });

  // 公告 block 暫時於 view 中隱藏（SHOW_ANNOUNCEMENTS=false），啟用時恢復此測試
  it.skip("renders contest announcements above the tabs", async () => {
    vi.mocked(getContestAnnouncements).mockResolvedValueOnce([
      {
        id: "ann-1",
        title: "考試公告",
        content: "請準時進入考場",
        created_at: "2099-05-05T09:00:00.000Z",
        updated_at: "2099-05-05T09:00:00.000Z",
        created_by: { username: "teacher" },
      },
    ]);

    renderDashboard(createContest());

    expect(await screen.findByText("考試公告")).toBeInTheDocument();
    expect(screen.getByText("請準時進入考場")).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "競賽資訊切換" })).toBeInTheDocument();
  });

  it("does not show answer records before the participant starts", () => {
    renderDashboard(createContest());

    expect(screen.getByText("總時長")).toBeInTheDocument();
    expect(screen.getByText("尚無作答紀錄。")).toBeInTheDocument();
    expect(screen.queryByText("Two Sum")).not.toBeInTheDocument();
  });

  it("renders in-exam progress and answering action", () => {
    renderDashboard(
      createContest({
        startTime: "2000-05-05T10:00:00.000Z",
        endTime: "2099-05-05T12:00:00.000Z",
        examStatus: "in_progress",
        problems: [
          {
            id: "binding-1",
            problemId: "problem-1",
            label: "A",
            title: "Two Sum",
            score: 50,
            maxScore: 50,
            userStatus: "AC",
          },
        ],
      }),
    );

    expect(screen.getByText("總時長")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /回到作答/ })).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.queryByText("已完成")).not.toBeInTheDocument();
    expect(screen.queryByText("已嘗試")).not.toBeInTheDocument();
  });

  it("keeps repeat check-in available after attendance is confirmed before exam start", () => {
    renderDashboardAtContestRoute(
      createContest({
        startTime: "2000-05-05T10:00:00.000Z",
        endTime: "2099-05-05T12:00:00.000Z",
        examStatus: "not_started",
        attendanceCheckEnabled: true,
        attendanceStatus: {
          attendanceRequired: true,
          checkInStatus: "photo_confirmed",
          checkOutStatus: "unavailable",
          canCheckIn: true,
          canStartExam: true,
          canCheckOut: false,
        },
      }),
    );

    expect(screen.getByRole("button", { name: /開始作答/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /重新簽到/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /前往簽到/ })).not.toBeInTheDocument();
  });

  it("uses attendance check-in instead of manual join when attendance is required", () => {
    renderDashboardAtContestRoute(
      createContest({
        hasJoined: false,
        isRegistered: false,
        attendanceCheckEnabled: true,
        attendanceStatus: {
          attendanceRequired: true,
          checkInStatus: "missing",
          checkOutStatus: "unavailable",
          canCheckIn: true,
          canStartExam: false,
          canCheckOut: false,
        },
      }),
    );

    expect(screen.getByRole("button", { name: /前往簽到/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /加入競賽/ })).not.toBeInTheDocument();
  });

  it("shows repeat check-out label after check-out is confirmed", () => {
    renderDashboardAtContestRoute(
      createContest({
        startTime: "2000-05-05T10:00:00.000Z",
        endTime: "2099-05-05T12:00:00.000Z",
        examStatus: "submitted",
        allowMultipleJoins: true,
        attendanceCheckEnabled: true,
        attendanceStatus: {
          attendanceRequired: true,
          checkInStatus: "photo_confirmed",
          checkOutStatus: "photo_confirmed",
          canCheckIn: false,
          canStartExam: true,
          canCheckOut: true,
        },
      }),
    );

    expect(screen.getByRole("button", { name: /重新簽退/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /下載作答證明/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /重新加入/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /前往簽退/ })).not.toBeInTheDocument();
  });

  it("renders in-exam paper progress from autosaved answers", async () => {
    vi.mocked(getExamQuestions).mockResolvedValueOnce([
      {
        id: "question-1",
        contestId: "contest-1",
        questionType: "short_answer",
        prompt: "Explain",
        options: [],
        explanation: "",
        score: 10,
        order: 1,
        createdAt: "2000-05-05T10:00:00.000Z",
        updatedAt: "2000-05-05T10:00:00.000Z",
      },
      {
        id: "question-2",
        contestId: "contest-1",
        questionType: "single_choice",
        prompt: "Choose",
        options: ["A", "B"],
        explanation: "",
        score: 5,
        order: 2,
        createdAt: "2000-05-05T10:00:00.000Z",
        updatedAt: "2000-05-05T10:00:00.000Z",
      },
    ]);
    vi.mocked(getMyExamAnswers).mockResolvedValueOnce([
      {
        id: "answer-1",
        questionId: "question-1",
        answer: { text: "draft answer" },
        createdAt: "2000-05-05T10:10:00.000Z",
        updatedAt: "2000-05-05T10:10:00.000Z",
      },
    ]);

    renderDashboard(
      createContest({
        contestType: "paper_exam",
        startTime: "2000-05-05T10:00:00.000Z",
        endTime: "2099-05-05T12:00:00.000Z",
        examStatus: "in_progress",
        examQuestionsCount: 2,
        problems: [],
      }),
    );

    expect(await screen.findByText("目前作答狀況")).toBeInTheDocument();
    expect(await screen.findByText("50%")).toBeInTheDocument();
    expect(screen.queryByText("已完成")).not.toBeInTheDocument();
    expect(screen.queryByText("已嘗試")).not.toBeInTheDocument();
    expect(screen.getByText("已作答")).toBeInTheDocument();
    expect(screen.getByText("未作答")).toBeInTheDocument();
    expect(screen.getByText("draft answer")).toBeInTheDocument();
    expect(getMyExamAnswers).toHaveBeenCalledWith("contest-1");
    expect(getExamResults).not.toHaveBeenCalled();
  });

  it("renders post-exam answer report and score distribution", async () => {
    renderDashboard(
      createContest({
        contestType: "paper_exam",
        startTime: "2000-05-05T10:00:00.000Z",
        endTime: "2000-05-05T12:00:00.000Z",
        examStatus: "submitted",
        resultsPublished: true,
        problems: [],
      }),
    );

    expect(screen.getByText("考試成績")).toBeInTheDocument();
    expect(screen.queryByText("成績單與分數分佈")).not.toBeInTheDocument();
    expect(screen.queryByText("作答狀態")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /下載成績單/ })).toBeInTheDocument();
    expect(await screen.findByText("成績分布")).toBeInTheDocument();
    expect(screen.getByText("平均 75.0 / 100")).toBeInTheDocument();
    expect(screen.getByTestId("score-distribution-chart")).toBeInTheDocument();
    expect(getExamDashboardSummary).toHaveBeenCalledWith("contest-1");
  });

  it("shows rejoin action after submission when multiple joins are allowed", () => {
    renderDashboard(
      createContest({
        startTime: "2000-05-05T10:00:00.000Z",
        endTime: "2099-05-05T12:00:00.000Z",
        examStatus: "submitted",
        allowMultipleJoins: true,
      }),
    );

    expect(screen.getByRole("button", { name: /下載作答證明/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /重新加入/ })).toBeInTheDocument();
  });

  it("renders published paper exam score from answer results", async () => {
    vi.mocked(getExamQuestions).mockResolvedValueOnce([
      {
        id: "question-1",
        contestId: "contest-1",
        questionType: "short_answer",
        prompt: "Explain",
        options: [],
        explanation: "",
        score: 10,
        order: 1,
        createdAt: "2000-05-05T10:00:00.000Z",
        updatedAt: "2000-05-05T10:00:00.000Z",
      },
    ]);
    vi.mocked(getExamResults).mockResolvedValueOnce([
      {
        id: "answer-1",
        questionId: "question-1",
        answer: { text: "answer" },
        createdAt: "2000-05-05T10:10:00.000Z",
        updatedAt: "2000-05-05T10:10:00.000Z",
        isCorrect: null,
        score: 8,
        feedback: "Good",
        gradedByUsername: "teacher",
        gradedAt: "2000-05-05T11:00:00.000Z",
      },
    ]);

    renderDashboard(
      createContest({
        contestType: "paper_exam",
        startTime: "2000-05-05T10:00:00.000Z",
        endTime: "2000-05-05T12:00:00.000Z",
        examStatus: "submitted",
        resultsPublished: true,
        examQuestionsCount: 1,
        problems: [],
      }),
    );

    expect(await screen.findAllByText("8 / 10")).not.toHaveLength(0);
    expect(screen.getByText("考試成績")).toBeInTheDocument();
    expect(screen.getByText("Good")).toBeInTheDocument();
    expect(screen.getByText("作答紀錄與成績")).toBeInTheDocument();
    expect(screen.queryByText("相關頁面")).not.toBeInTheDocument();
  });
});
