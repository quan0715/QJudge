import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GradingByQuestionTabScreen from "./GradingByQuestionTabScreen";
import type { GradingAnswerRow, QuestionProgress } from "./gradingTypes";

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
        (result, [paramKey, value]) =>
          result.replace(`{{${paramKey}}}`, String(value)),
        fallback,
      );
    },
  }),
}));

vi.mock("@/features/contest/components/admin/layout/AdminSplitLayout", () => ({
  default: ({
    sidebar,
    middlePane,
    children,
  }: {
    sidebar: ReactNode;
    middlePane: ReactNode;
    children: ReactNode;
  }) => (
    <div>
      {sidebar}
      {middlePane}
      {children}
    </div>
  ),
}));

vi.mock("./QuestionSidebarScreen", () => ({
  default: () => <div>question-list</div>,
}));

vi.mock("./GradingSplitPanelScreen", () => ({
  default: () => <div>grading-panel</div>,
}));

vi.mock("./GradingMobileNav", () => ({
  default: () => null,
}));

vi.mock("./components/ScorePolicyMenu", () => ({
  default: () => <button type="button">score-policy</button>,
}));

const answer: GradingAnswerRow = {
  id: "answer-1",
  studentId: "student-1",
  studentUsername: "student1",
  studentDisplayName: "Student One",
  questionId: "question-1",
  questionIndex: 1,
  questionPrompt: "Question prompt",
  questionType: "short_answer",
  questionOptions: [],
  maxScore: 2,
  answerContent: { text: "answer" },
  score: 2,
  feedback: "",
  gradedBy: "teacher",
  gradedAt: "2026-08-13T00:00:00Z",
  isAutoGraded: false,
  correctAnswer: null,
};

const question: QuestionProgress = {
  questionId: "question-1",
  questionIndex: 1,
  questionType: "short_answer",
  prompt: "Question prompt",
  maxScore: 2,
  totalAnswers: 1,
  gradedCount: 1,
  progressPercent: 100,
  isObjective: false,
};

describe("GradingByQuestionTabScreen", () => {
  it("shows one username line without a row-level flag action", () => {
    renderScreen();

    const username = screen.getByText("student1");
    expect(username.className).toContain("title");
    expect(screen.queryByText("Student One")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "標記" }),
    ).not.toBeInTheDocument();
  });

  it("presents graded answer scores as quiet accessible text", () => {
    renderScreen();

    const score = screen.getByLabelText("得分 2.00，共 2.00 分");
    expect(score).toHaveTextContent("2.00/2.00");
    expect(score.tagName).toBe("SPAN");
  });
});

function renderScreen() {
  return render(
    <GradingByQuestionTabScreen
      questionProgress={[question]}
      answersByQuestion={new Map([["question-1", [answer]]])}
      students={[
        {
          studentId: "student-1",
          username: "student1",
          displayName: "Student One",
        },
      ]}
      onGrade={vi.fn()}
      onUngrade={vi.fn()}
      flaggedIds={new Set()}
      onToggleFlag={vi.fn()}
      searchQuery=""
      filter="all"
      selectedQuestionId="question-1"
      onSelectedQuestionIdChange={vi.fn()}
      selectedStudentId="student-1"
      onSelectedStudentIdChange={vi.fn()}
    />,
  );
}
