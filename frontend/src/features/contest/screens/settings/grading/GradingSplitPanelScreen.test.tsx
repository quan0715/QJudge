import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GradingSplitPanelScreen from "./GradingSplitPanelScreen";
import type { GradingAnswerRow } from "./gradingTypes";

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
      if (!params) {
        return fallback;
      }
      return Object.entries(params).reduce(
        (acc, [paramKey, value]) =>
          acc.replace(`{{${paramKey}}}`, String(value)),
        fallback,
      );
    },
  }),
}));

vi.mock("@/shared/ui/markdown/MarkdownContent", () => ({
  default: {
    Problem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  },
}));

vi.mock("@/features/contest/components/exam/AnswerDisplay", () => ({
  default: () => <div>answer-display</div>,
}));

const answer: GradingAnswerRow = {
  id: "a-1",
  studentId: "s-1",
  studentUsername: "student1",
  studentDisplayName: "Student One",
  questionId: "q-1",
  questionIndex: 1,
  questionPrompt: "Question prompt",
  questionType: "short_answer",
  questionOptions: [],
  maxScore: 10,
  answerContent: {},
  score: 3,
  feedback: "",
  gradedBy: null,
  gradedAt: null,
  isAutoGraded: false,
  correctAnswer: null,
};

const nextAnswer: GradingAnswerRow = {
  ...answer,
  id: "a-2",
  questionIndex: 2,
  questionPrompt: "Next question prompt",
};

describe("GradingSplitPanelScreen", () => {
  it("keeps the header focused on the current question", () => {
    render(
      <GradingSplitPanelScreen
        answer={answer}
        onGrade={vi.fn()}
        flowMode="byStudent"
      />,
    );

    const header = screen.getByRole("banner", { name: "目前批改題目" });
    expect(within(header).getByText("Q1")).toBeInTheDocument();
    expect(within(header).queryByText("short_answer")).not.toBeInTheDocument();
    expect(within(header).queryByText(/Student One/)).not.toBeInTheDocument();
    expect(within(header).queryByText(/10.00/)).not.toBeInTheDocument();
  });

  it("uses one vertical reading flow for evidence and grading controls", () => {
    const scss = readFileSync(
      resolve(
        process.cwd(),
        "src/features/contest/screens/settings/grading/GradingPanel.module.scss",
      ),
      "utf8",
    );
    const bodyRule = scss.match(/\.panelBodyContent\s*\{([^}]*)\}/)?.[1];

    expect(bodyRule).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(bodyRule).not.toMatch(/minmax\(18rem, 20rem\)/);
  });

  it("separates grading evidence from score controls", () => {
    render(
      <GradingSplitPanelScreen
        answer={answer}
        onGrade={vi.fn()}
        flowMode="byStudent"
      />,
    );

    const evidence = screen.getByRole("article", { name: "批改內容" });
    const inspector = screen.getByRole("complementary", { name: "評分控制" });

    expect(evidence).toHaveTextContent("Question prompt");
    expect(evidence).toHaveTextContent("answer-display");
    expect(
      within(evidence).getByRole("region", { name: "題目" }),
    ).toBeInTheDocument();
    expect(inspector).toContainElement(screen.getByLabelText("評語（選填）"));
  });

  it("keeps keyboard shortcuts behind an explicit disclosure", () => {
    render(
      <GradingSplitPanelScreen
        answer={answer}
        onGrade={vi.fn()}
        flowMode="byStudent"
      />,
    );

    const shortcutButton = screen.getByRole("button", { name: "鍵盤快捷鍵" });
    expect(shortcutButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(shortcutButton);

    expect(shortcutButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("調整分數")).toBeVisible();
    expect(screen.getByText("直接輸入")).toBeVisible();
  });

  it("grades and advances without switching button label to saved in save-next flow", () => {
    const onGrade = vi.fn();
    const onNextStudent = vi.fn();

    render(
      <GradingSplitPanelScreen
        answer={answer}
        onGrade={onGrade}
        flowMode="byQuestion"
        onNextStudent={onNextStudent}
        hasNextStudent
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "儲存並下一位學生" }));

    expect(onGrade).toHaveBeenCalledWith("a-1", 3, "");
    expect(onNextStudent).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("button", { name: "已儲存" }),
    ).not.toBeInTheDocument();
  });

  it("smoothly scrolls the answer pane back to top when switching students", () => {
    const onGrade = vi.fn();
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });

    const { rerender } = render(
      <GradingSplitPanelScreen
        answer={answer}
        onGrade={onGrade}
        flowMode="byStudent"
      />,
    );

    rerender(
      <GradingSplitPanelScreen
        answer={nextAnswer}
        onGrade={onGrade}
        flowMode="byStudent"
      />,
    );

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });
});
