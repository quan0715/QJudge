import { describe, expect, it } from "vitest";
import type { BankQuestion, QuestionBank } from "@/core/entities/question-bank.entity";
import {
  buildQuestionPreviewMeta,
  filterQuestions,
  formatDownloadCount,
  getQuestionDisplayTitle,
  getQuestionTypeToken,
} from "./questionBankProblemManagement.utils";

const bank: QuestionBank = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Bank",
  description: "",
  category: "exam",
  visibility: "private",
  verified: true,
  reviewStatus: "approved",
  ownerUsername: "QJudge Community",
  questionCount: 2,
};

const questions: BankQuestion[] = [
  {
    id: "q-1",
    bankId: bank.id,
    questionType: "exam",
    title: "矩陣索引查詢",
    prompt: "二維陣列與搜尋",
    options: ["a", "b"],
    correctAnswer: 0,
    score: 10,
    order: 0,
    difficulty: "easy",
    timeLimit: 1000,
    memoryLimit: 128,
    metadata: {
      exam_question_type: "single_choice",
      tags: ["matrix", "search"],
      download_count: 3200,
    },
  },
  {
    id: "q-2",
    bankId: bank.id,
    questionType: "coding",
    title: "Binary Search",
    prompt: "Implement binary search",
    options: [],
    correctAnswer: null,
    score: 100,
    order: 1,
    difficulty: "medium",
    timeLimit: 1000,
    memoryLimit: 128,
    metadata: {
      tags: ["search"],
    },
  },
];

describe("questionBankProblemManagement.utils", () => {
  it("filters by keyword + difficulty + tags + types", () => {
    const filtered = filterQuestions(questions, {
      keyword: "索引",
      difficulty: ["easy"],
      tags: ["matrix"],
      questionTypes: ["exam:single_choice"],
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("q-1");
  });

  it("resolves question type token", () => {
    expect(getQuestionTypeToken(questions[0])).toBe("exam:single_choice");
    expect(getQuestionTypeToken(questions[1])).toBe("coding");
  });

  it("builds preview meta and download formatter", () => {
    const meta = buildQuestionPreviewMeta(questions[0], bank);
    expect(meta.providerName).toBe("QJudge Community");
    expect(meta.downloadCount).toBe(3200);
    expect(meta.isVerified).toBe(true);
    expect(formatDownloadCount(meta.downloadCount)).toBe("3.2k");
  });

  it("prefers non-generated title over prompt", () => {
    const title = getQuestionDisplayTitle({
      title: "陣列索引查詢",
      prompt: "這段 prompt 不應該覆蓋 title",
      questionType: "exam",
    });
    expect(title).toBe("陣列索引查詢");
  });

  it("falls back from generated title to prompt", () => {
    const title = getQuestionDisplayTitle({
      title: "Test - Q12",
      prompt: "請說明堆疊與佇列差異",
      questionType: "exam",
    });
    expect(title).toContain("請說明堆疊與佇列差異");
  });
});
