import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GradingMatrixViewScreen from "./GradingMatrixViewScreen";
import type { GradingAnswerRow, QuestionProgress } from "./gradingTypes";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      key: string,
      fallbackOrParams?: string | Record<string, unknown>,
      maybeParams?: Record<string, unknown>,
    ) => {
      const fallback = typeof fallbackOrParams === "string" ? fallbackOrParams : key;
      const params =
        typeof fallbackOrParams === "string" ? maybeParams : fallbackOrParams;
      if (!params) {
        return fallback;
      }
      return Object.entries(params).reduce(
        (acc, [paramKey, value]) => acc.replace(`{{${paramKey}}}`, String(value)),
        fallback,
      );
    },
  }),
}));

const questionProgress: QuestionProgress[] = [
  {
    questionId: "q-1",
    questionIndex: 1,
    questionType: "short_answer",
    prompt: "Question 1",
    maxScore: 10,
    totalAnswers: 2,
    gradedCount: 1,
    progressPercent: 50,
    isObjective: false,
  },
  {
    questionId: "q-2",
    questionIndex: 2,
    questionType: "short_answer",
    prompt: "Question 2",
    maxScore: 5,
    totalAnswers: 1,
    gradedCount: 0,
    progressPercent: 0,
    isObjective: false,
  },
];

const students = [
  { studentId: "s-1", username: "u1", nickname: "Student A" },
  { studentId: "s-2", username: "u2", nickname: "Student B" },
];

const answersByQuestion = new Map<string, GradingAnswerRow[]>([
  [
    "q-1",
    [
      {
        id: "a-1",
        studentId: "s-1",
        studentUsername: "u1",
        studentNickname: "Student A",
        questionId: "q-1",
        questionIndex: 1,
        questionPrompt: "Question 1",
        questionType: "short_answer",
        questionOptions: [],
        maxScore: 10,
        answerContent: {},
        score: 8,
        feedback: "",
        gradedBy: "teacher",
        gradedAt: null,
        isAutoGraded: false,
        correctAnswer: null,
      },
      {
        id: "a-2",
        studentId: "s-2",
        studentUsername: "u2",
        studentNickname: "Student B",
        questionId: "q-1",
        questionIndex: 1,
        questionPrompt: "Question 1",
        questionType: "short_answer",
        questionOptions: [],
        maxScore: 10,
        answerContent: {},
        score: null,
        feedback: "",
        gradedBy: null,
        gradedAt: null,
        isAutoGraded: false,
        correctAnswer: null,
      },
    ],
  ],
]);

describe("GradingMatrixViewScreen", () => {
  it("renders matrix status and emits selection when a cell is clicked", () => {
    const onSelectCell = vi.fn();

    render(
      <GradingMatrixViewScreen
        questionProgress={questionProgress}
        students={students}
        answersByQuestion={answersByQuestion}
        onSelectCell={onSelectCell}
      />,
    );

    expect(screen.getByText("學生 2 人 · 題目 2 題")).toBeInTheDocument();
    expect(screen.getByText("已批改 1")).toBeInTheDocument();
    expect(screen.getByText("待批改 1")).toBeInTheDocument();
    expect(screen.getByText("未作答 2")).toBeInTheDocument();
    expect(screen.getByTestId("matrix-summary-label")).toHaveTextContent("總和（平均）");
    expect(screen.getByTestId("matrix-summary-total")).toHaveTextContent("4");
    expect(screen.getByTestId("matrix-summary-cell-0")).toHaveTextContent("8");
    expect(screen.getByTestId("matrix-summary-cell-1")).toHaveTextContent("-");

    fireEvent.click(screen.getByTestId("matrix-cell-0-0"));
    expect(onSelectCell).toHaveBeenCalledWith("q-1", "s-1");
  });

  it("supports arrow-key navigation and Enter to open selected cell", () => {
    const onSelectCell = vi.fn();
    render(
      <GradingMatrixViewScreen
        questionProgress={questionProgress}
        students={students}
        answersByQuestion={answersByQuestion}
        onSelectCell={onSelectCell}
      />,
    );

    const firstCell = screen.getByTestId("matrix-cell-0-0");
    firstCell.focus();
    expect(firstCell).toHaveFocus();

    act(() => {
      fireEvent.keyDown(firstCell, { key: "ArrowRight" });
    });
    const rightCell = screen.getByTestId("matrix-cell-0-1");
    expect(rightCell).toHaveFocus();

    act(() => {
      fireEvent.keyDown(rightCell, { key: "ArrowDown" });
    });
    const downCell = screen.getByTestId("matrix-cell-1-1");
    expect(downCell).toHaveFocus();

    act(() => {
      fireEvent.keyDown(downCell, { key: "Enter" });
    });
    expect(onSelectCell).toHaveBeenCalledWith("q-2", "s-2");
  });
});
