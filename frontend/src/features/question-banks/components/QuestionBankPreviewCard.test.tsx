import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BankQuestion, QuestionBank } from "@/core/entities/question-bank.entity";
import QuestionBankPreviewCard from "./QuestionBankPreviewCard";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback || _key,
  }),
}));

const bank: QuestionBank = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "題庫 A",
  description: "",
  icon: "",
  coverUrl: "",
  category: "exam",
  visibility: "private",
  verified: true,
  reviewStatus: "approved",
  ownerUsername: "QJudge",
  questionCount: 1,
};

const examQuestion: BankQuestion = {
  id: "q-1",
  bankId: bank.id,
  questionType: "exam",
  title: "Test-Q12",
  prompt: "請說明作業系統的排程策略",
  options: ["A", "B"],
  correctAnswer: 0,
  score: 1,
  order: 1,
  difficulty: "medium",
  timeLimit: 1000,
  memoryLimit: 128,
  metadata: {
    exam_question_type: "single_choice",
    pass_rate: 0.78,
    tags: ["OS", "scheduling"],
    download_count: 1234,
  },
};

describe("QuestionBankPreviewCard", () => {
  it("renders 3-row card content and title fallback", () => {
    render(<QuestionBankPreviewCard bank={bank} question={examQuestion} />);

    expect(screen.getByText("請說明作業系統的排程策略")).toBeInTheDocument();
    expect(screen.getByText("OS")).toBeInTheDocument();
    expect(screen.getByText("scheduling")).toBeInTheDocument();
    expect(screen.getByText(/通過率/i)).toBeInTheDocument();
  });

  it("supports neutral icon variant and selectable click", () => {
    const onClick = vi.fn();
    const { container } = render(
      <QuestionBankPreviewCard
        bank={bank}
        question={examQuestion}
        onClick={onClick}
        selected
        showSelection
        iconVariant="neutral"
      />
    );

    fireEvent.click(container.querySelector('[class*="card"]') as HTMLElement);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[class*="cardSelected"]')).toBeTruthy();
  });
});
