import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChangeEventHandler, ReactNode } from "react";
import type {
  ContestDetail,
} from "@/core/entities/contest.entity";
import { getExamQuestions } from "@/infrastructure/api/repositories/examQuestions.repository";
import {
  getExamResults,
  getMyExamAnswers,
} from "@/infrastructure/api/repositories/examAnswers.repository";
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
  Tag: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  TextInput: () => <input aria-label="text input" />,
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

vi.mock("@/features/contest/components/exam/PaperQuestionOverviewTable", () => ({
  default: ({
    rows,
    showScore,
    showFeedback,
  }: {
    rows: Array<{
      id: string;
      index: number;
      prompt: string;
      scoreDisplay?: string;
      feedbackDisplay?: string;
      statusLabel?: string;
    }>;
    showScore?: boolean;
    showFeedback?: boolean;
  }) => (
    <div>
      {rows.map((row) => (
        <div key={row.id}>
          <span>{row.index}</span>
          <span>{row.prompt}</span>
          <span>{row.statusLabel}</span>
          {showScore ? <span>{row.scoreDisplay}</span> : null}
          {showFeedback ? <span>{row.feedbackDisplay}</span> : null}
        </div>
      ))}
    </div>
  ),
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
    <StudentContestDashboard
      contest={contest}
    />,
  );

describe("StudentContestDashboard", () => {
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
    expect(screen.getByText("考試前")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /加入競賽/ })).toBeInTheDocument();
  });

  it("does not show answer records before the participant starts", () => {
    renderDashboard(createContest());

    expect(screen.getByText("考試前")).toBeInTheDocument();
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

    expect(screen.getByText("考試中")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /回到作答/ })).toBeInTheDocument();
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
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
    expect(await screen.findByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByText("已作答")).toBeInTheDocument();
    expect(screen.getByText("未作答")).toBeInTheDocument();
    expect(getMyExamAnswers).toHaveBeenCalledWith("contest-1");
    expect(getExamResults).not.toHaveBeenCalled();
  });

  it("renders post-exam answer report without extra score panels", () => {
    renderDashboard(
      createContest({
        startTime: "2000-05-05T10:00:00.000Z",
        endTime: "2000-05-05T12:00:00.000Z",
        examStatus: "submitted",
        resultsPublished: true,
      }),
    );

    expect(screen.getByText("考試後")).toBeInTheDocument();
    expect(screen.queryByText("分數分佈")).not.toBeInTheDocument();
    expect(screen.queryByText("成績單與分數分佈")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /下載作答報告/ })).toBeInTheDocument();
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
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.queryByText("Good")).not.toBeInTheDocument();
    expect(screen.getByText("作答紀錄與成績")).toBeInTheDocument();
    expect(screen.queryByText("相關頁面")).not.toBeInTheDocument();
  });
});
