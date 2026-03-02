import { describe, expect, it } from "vitest";
import type { ExamQuestion } from "@/core/entities/contest.entity";
import {
  EXAM_QUESTION_JSON_VERSION,
  buildExamQuestionJsonV1,
  parseExamQuestionJsonV1,
  stringifyExamQuestionJsonV1,
} from "./examQuestionJson";

const sampleQuestions: ExamQuestion[] = [
  {
    id: "1",
    contestId: "c1",
    questionType: "single_choice",
    prompt: "Q1",
    options: ["A", "B"],
    correctAnswer: 0,
    score: 5,
    order: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "2",
    contestId: "c1",
    questionType: "true_false",
    prompt: "Q2",
    options: ["True", "False"],
    correctAnswer: true,
    score: 3,
    order: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

describe("examQuestionJson", () => {
  it("parses a valid v1 payload", () => {
    const json = {
      version: EXAM_QUESTION_JSON_VERSION,
      meta: {
        exported_at: "2026-03-02T00:00:00.000Z",
        contest_name: "OS Exam",
      },
      questions: [
        {
          question_type: "single_choice",
          prompt: "What is 2+2?",
          score: 5,
          options: ["3", "4"],
          correct_answer: 1,
          order: 1,
        },
        {
          question_type: "true_false",
          prompt: "Linux is a kernel",
          score: 2,
          correct_answer: "true",
          order: 0,
        },
      ],
    };

    const result = parseExamQuestionJsonV1(JSON.stringify(json));
    expect(result.success).toBe(true);
    expect(result.data?.questions).toHaveLength(2);
    expect(result.data?.questions[0].question_type).toBe("true_false");
    expect(result.data?.questions[0].correct_answer).toBe(0);
    expect(result.data?.questions[0].order).toBe(0);
    expect(result.data?.questions[1].order).toBe(1);
  });

  it("rejects unknown root and question fields in strict mode", () => {
    const json = {
      version: EXAM_QUESTION_JSON_VERSION,
      meta: {
        exported_at: "2026-03-02T00:00:00.000Z",
        contest_name: "OS Exam",
      },
      unknown_root: true,
      questions: [
        {
          question_type: "essay",
          prompt: "Explain mutex",
          score: 5,
          unknown_field: "x",
        },
      ],
    };

    const result = parseExamQuestionJsonV1(JSON.stringify(json));
    expect(result.success).toBe(false);
    const fields = result.errors?.map((e) => e.field) ?? [];
    expect(fields).toContain("root.unknown_root");
    expect(fields).toContain("questions[0].unknown_field");
  });

  it("rejects invalid single_choice and multiple_choice boundaries", () => {
    const json = {
      version: EXAM_QUESTION_JSON_VERSION,
      meta: {
        exported_at: "2026-03-02T00:00:00.000Z",
        contest_name: "OS Exam",
      },
      questions: [
        {
          question_type: "single_choice",
          prompt: "Pick one",
          score: 5,
          options: ["A", "B"],
          correct_answer: 3,
        },
        {
          question_type: "multiple_choice",
          prompt: "Pick many",
          score: 5,
          options: ["A", "B"],
          correct_answer: [0, 5],
        },
      ],
    };

    const result = parseExamQuestionJsonV1(JSON.stringify(json));
    expect(result.success).toBe(false);
    const fields = result.errors?.map((e) => e.field) ?? [];
    expect(fields).toContain("questions[0].correct_answer");
    expect(fields).toContain("questions[1].correct_answer");
  });

  it("build + parse round-trip keeps portable fields", () => {
    const text = stringifyExamQuestionJsonV1(sampleQuestions, "Contest A");
    const parsed = parseExamQuestionJsonV1(text);

    expect(parsed.success).toBe(true);
    expect(parsed.data?.version).toBe(EXAM_QUESTION_JSON_VERSION);
    expect(parsed.data?.questions).toHaveLength(2);
    expect(parsed.data?.questions[0].question_type).toBe("true_false");
    expect(parsed.data?.questions[0].options).toEqual(["True", "False"]);
    expect(parsed.data?.questions[1].question_type).toBe("single_choice");
    expect(parsed.data?.questions[1].options).toEqual(["A", "B"]);
  });

  it("build output should not include system fields", () => {
    const built = buildExamQuestionJsonV1(sampleQuestions, "Contest A");
    const first = built.questions[0] as Record<string, unknown>;

    expect(first.id).toBeUndefined();
    expect(first.contestId).toBeUndefined();
    expect(first.createdAt).toBeUndefined();
    expect(first.updatedAt).toBeUndefined();
  });
});
