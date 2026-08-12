import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GradingByStudentTabScreen from "./GradingByStudentTabScreen";
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
    sidebar: React.ReactNode;
    middlePane: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div>
      {sidebar}
      {middlePane}
      {children}
    </div>
  ),
}));

vi.mock("./GradingSplitPanelScreen", () => ({
  default: () => <div>grading-panel</div>,
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

describe("GradingByStudentTabScreen", () => {
  it("shows one username line without a row-level flag action", () => {
    renderScreen();

    const username = screen.getByText("student1");
    expect(username.className).toContain("title");
    expect(screen.queryByText("Student One")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "標記" }),
    ).not.toBeInTheDocument();
  });

  it("compresses completed progress into a labelled completion icon", () => {
    renderScreen();

    expect(screen.getByLabelText("1/1 完成")).toBeInTheDocument();
    expect(screen.queryByText("1/1")).not.toBeInTheDocument();
  });

  it("presents a graded question score as quiet status text", () => {
    renderScreen();

    const score = screen.getByLabelText("得分 2.00，共 2.00 分");
    expect(score).toHaveTextContent("2.00/2.00");
    expect(score.tagName).toBe("SPAN");
  });

  it("shows a question type icon for each question", () => {
    renderScreen([
      answer,
      {
        ...answer,
        id: "answer-2",
        questionId: "question-2",
        questionIndex: 2,
      },
    ]);

    expect(screen.getAllByTestId("question-type-marker")).toHaveLength(2);
  });
});

function renderScreen(studentAnswers: GradingAnswerRow[] = [answer]) {
  const questions = studentAnswers.map((studentAnswer) => ({
    ...question,
    questionId: studentAnswer.questionId,
    questionIndex: studentAnswer.questionIndex,
  }));
  return render(
    <GradingByStudentTabScreen
      answersByStudent={new Map([["student-1", studentAnswers]])}
      questionProgress={questions}
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
      selectedStudentId="student-1"
      onSelectedStudentIdChange={vi.fn()}
    />,
  );
}
