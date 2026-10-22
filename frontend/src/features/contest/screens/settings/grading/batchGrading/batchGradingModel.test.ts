import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/core/types/chatbot.types";
import type { GradingAnswerRow } from "../gradingTypes";
import {
  applyFinalizeTimeout,
  buildBatchRunPrompt,
  deriveBatchState,
  isUnfinished,
  selectBatchQuestions,
  selectRevertableAnswers,
  type BatchQuestion,
  type BatchQuestionState,
} from "./batchGradingModel";

const row = (overrides: Partial<GradingAnswerRow>): GradingAnswerRow =>
  ({
    id: "a1",
    studentUsername: "s1",
    questionId: "q1",
    questionIndex: 1,
    questionType: "essay",
    maxScore: 10,
    answerContent: { text: "答案" },
    score: null,
    feedback: "",
    ...overrides,
  }) as GradingAnswerRow;

const question = (overrides: Partial<BatchQuestion> = {}): BatchQuestion => ({
  questionId: "q1",
  label: "Q1",
  index: 1,
  maxScore: 10,
  ungradedRows: [row({})],
  skippedCount: 0,
  ...overrides,
});

const userMessage = (questionId: string, runId: string): ChatMessage => ({
  id: `u-${runId}`,
  role: "user",
  content: `batch_question_id: ${questionId}\n請批改`,
  timestamp: new Date(0),
  runId,
});

const assistantMessage = (runId: string, runStatus: ChatMessage["runStatus"]): ChatMessage => ({
  id: `a-${runId}`,
  role: "assistant",
  content: "",
  timestamp: new Date(0),
  runId,
  runStatus,
});

const stateOf = (status: BatchQuestionState["status"]): BatchQuestionState => ({
  questionId: "q1",
  label: "Q1",
  index: 1,
  status,
  ungradedCount: 0,
  writtenCount: 0,
});

const PROGRESS_HEADER =
  "question_id,run_id,status,written_count,skipped_count,out_of_range_count,error,updated_at\n";

describe("selectBatchQuestions", () => {
  it("selects only ungraded short answer and essay rows", () => {
    const questions = selectBatchQuestions([
      row({ id: "a1", questionId: "q1", questionIndex: 1, questionType: "essay" }),
      row({ id: "a2", questionId: "q1", questionIndex: 1, questionType: "essay", score: 4 }),
      row({ id: "a3", questionId: "q2", questionIndex: 2, questionType: "short_answer" }),
      row({ id: "a4", questionId: "q3", questionIndex: 3, questionType: "single_choice" }),
      row({ id: "a5", questionId: "q2", questionIndex: 2, questionType: "short_answer", isAbsent: true }),
    ]);

    expect(questions.map((q) => [q.questionId, q.ungradedRows.map((r) => r.id), q.skippedCount]))
      .toEqual([
        ["q1", ["a1"], 1],
        ["q2", ["a3"], 0],
      ]);
    expect(questions[0]).toMatchObject({ label: "Q1", index: 1, maxScore: 10 });
  });

  it("prefixes the question label like the grading page does", () => {
    const [question] = selectBatchQuestions([row({ questionLabel: "2-1", questionIndex: 3 })]);
    expect(question.label).toBe("Q2-1");
  });
});

describe("buildBatchRunPrompt", () => {
  it("run prompt starts with batch_question_id line", () => {
    const prompt = buildBatchRunPrompt({ contestId: "c1", questionId: "q7", label: "Q7", maxScore: 15 });

    expect(prompt.split("\n")[0]).toBe("batch_question_id: q7");
    expect(prompt).toContain("grade_q7.csv");
    expect(prompt).toContain("0 到 15");
    expect(prompt).not.toContain("重改註記");
  });

  it("includes the regrade note when given", () => {
    const prompt = buildBatchRunPrompt({
      contestId: "c1", questionId: "q7", label: "Q7", maxScore: 15, regradeNote: "英文不扣分",
    });

    expect(prompt).toContain("重改註記");
    expect(prompt).toContain("英文不扣分");
  });
});

describe("deriveBatchState", () => {
  it("derives queued and running from active runs", () => {
    const state = deriveBatchState({
      questions: [question({ questionId: "q1" }), question({ questionId: "q2", index: 2 })],
      messages: [userMessage("q1", "r1"), userMessage("q2", "r2")],
      activeRuns: [{ id: "r1", status: "running" }, { id: "r2", status: "queued" }],
      progressCsv: null,
      writtenCounts: {},
    });

    expect(state.map((q) => q.status)).toEqual(["running", "queued"]);
  });

  it("derives completed from progress row of the same run", () => {
    const state = deriveBatchState({
      questions: [question()],
      messages: [userMessage("q1", "r1"), assistantMessage("r1", "completed")],
      activeRuns: [],
      progressCsv: `${PROGRESS_HEADER}q1,r1,completed,1,0,0,,2026-10-22\n`,
      writtenCounts: { q1: 3 },
    });

    expect(state[0]).toMatchObject({ status: "completed", writtenCount: 3, runId: "r1" });
  });

  it("ignores a progress row from an older run", () => {
    const state = deriveBatchState({
      questions: [question()],
      messages: [userMessage("q1", "r1"), userMessage("q1", "r2"), assistantMessage("r2", "completed")],
      activeRuns: [],
      progressCsv: `${PROGRESS_HEADER}q1,r1,failed,0,0,0,boom,2026-10-22\n`,
      writtenCounts: {},
    });

    expect(state[0].status).toBe("running");
  });

  it("treats terminal run without progress row as running", () => {
    const state = deriveBatchState({
      questions: [question()],
      messages: [userMessage("q1", "r1"), assistantMessage("r1", "failed")],
      activeRuns: [],
      progressCsv: null,
      writtenCounts: {},
    });

    expect(state[0]).toMatchObject({ status: "running", finalizing: true });
  });

  it("treats a cancelled queued run as cancelled", () => {
    const state = deriveBatchState({
      questions: [question()],
      messages: [userMessage("q1", "r1"), assistantMessage("r1", "queued")],
      activeRuns: [],
      progressCsv: null,
      writtenCounts: {},
    });

    expect(state[0].status).toBe("cancelled");
  });

  it("surfaces failure errors", () => {
    const state = deriveBatchState({
      questions: [question()],
      messages: [userMessage("q1", "r1")],
      activeRuns: [],
      progressCsv: `${PROGRESS_HEADER}q1,r1,failed,0,0,0,模型逾時,2026-10-22\n`,
      writtenCounts: {},
    });

    expect(state[0]).toMatchObject({ status: "failed", error: "模型逾時" });
  });

  it("marks question without ungraded answers as skipped", () => {
    const state = deriveBatchState({
      questions: [question({ ungradedRows: [], skippedCount: 4 })],
      messages: [],
      activeRuns: [],
      progressCsv: null,
      writtenCounts: {},
    });

    expect(state[0].status).toBe("skipped");
  });

  it("maps paused approvals to awaiting-approval", () => {
    const state = deriveBatchState({
      questions: [question()],
      messages: [userMessage("q1", "r1")],
      activeRuns: [{ id: "r1", status: "awaiting_approval" }],
      progressCsv: null,
      writtenCounts: {},
    });

    expect(state[0].status).toBe("awaiting-approval");
  });
});

describe("isUnfinished", () => {
  it("counts completed questions that still have ungraded answers", () => {
    expect(isUnfinished({ ...stateOf("completed"), ungradedCount: 2 })).toBe(true);
    expect(isUnfinished({ ...stateOf("completed"), ungradedCount: 0 })).toBe(false);
    expect(isUnfinished({ ...stateOf("running"), ungradedCount: 2 })).toBe(false);
    expect(isUnfinished({ ...stateOf("skipped"), ungradedCount: 0 })).toBe(false);
  });
});

describe("applyFinalizeTimeout", () => {
  it("turns a run stuck in finalizing into a failure after the timeout", () => {
    const firstSeen = new Map<string, number>();
    const finalizing = { ...stateOf("running"), runId: "r1", finalizing: true };

    const early = applyFinalizeTimeout([finalizing], firstSeen, 1_000, 60_000);
    const late = applyFinalizeTimeout([finalizing], firstSeen, 70_000, 60_000);

    expect(early[0].status).toBe("running");
    expect(late[0]).toMatchObject({ status: "failed", error: "finalizeTimeout" });
  });

  it("leaves active runs alone", () => {
    const running = { ...stateOf("running"), runId: "r1" };
    expect(applyFinalizeTimeout([running], new Map([["r1", 0]]), 999_999, 60_000)[0].status)
      .toBe("running");
  });
});

describe("selectRevertableAnswers", () => {
  it("revert skips answers changed after AI write", () => {
    const ids = selectRevertableAnswers(
      [
        { examAnswerId: "a1", score: 8, feedback: "AI 理由" },
        { examAnswerId: "a2", score: 6, feedback: "AI 理由" },
        { examAnswerId: "a3", score: 5, feedback: "AI 理由" },
      ],
      [
        row({ id: "a1", score: 8, feedback: "AI 理由" }),
        row({ id: "a2", score: 7, feedback: "AI 理由" }),
        row({ id: "a3", score: null, feedback: "" }),
      ],
    );

    expect(ids).toEqual(["a1"]);
  });
});
