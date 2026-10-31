import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/core/types/chatbot.types";
import type { GradingUnitProgress } from "@/infrastructure/api/repositories/examAnswers.repository";
import type { GradingAnswerRow } from "../gradingTypes";
import {
  currentWrites,
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
  label: "1.",
  index: 1,
  maxScore: 10,
  ungradedRows: [row({})],
  skippedCount: 0,
  ...overrides,
});

const request = (runId: string, questionIds: string[]): ChatMessage => ({
  id: `u-${runId}`,
  role: "user",
  content: `batch_units: ${JSON.stringify([{ id: "u", label: "1.", question_ids: questionIds }])}\n請批改1.。`,
  timestamp: new Date(0),
  runId,
});

const ended = (runId: string, runStatus: ChatMessage["runStatus"], runError?: string): ChatMessage => ({
  id: `a-${runId}`,
  role: "assistant",
  content: "",
  timestamp: new Date(0),
  runId,
  runStatus,
  runError,
});

const unit = (overrides: Partial<GradingUnitProgress>): GradingUnitProgress => ({
  unit_id: "u",
  question_ids: ["q1"],
  run_id: "r1",
  total_count: 1,
  draft_count: 1,
  written_count: 1,
  skipped_count: 0,
  status: "completed",
  ...overrides,
});

const derive = (input: Partial<Parameters<typeof deriveBatchState>[0]>) =>
  deriveBatchState({ questions: [question()], messages: [], activeRuns: [], units: [], written: [],
    notSubmittedError: "not submitted", ...input });

describe("selectBatchQuestions", () => {
  it("selects ungraded short answer and essay rows", () => {
    const questions = selectBatchQuestions([
      row({ id: "a1" }),
      row({ id: "a2", score: 3 }),
      row({ id: "c1", questionId: "q2", questionType: "single_choice" }),
    ]);
    expect(questions.map((q) => [q.questionId, q.ungradedRows.length, q.skippedCount])).toEqual([["q1", 1, 1]]);
  });
});

describe("deriveBatchState", () => {
  it("is idle until a run asks for the question", () => {
    expect(derive({})[0].status).toBe("idle");
  });

  it("follows the active run that asked for the question", () => {
    const messages = [request("r1", ["q1"])];
    expect(derive({ messages, activeRuns: [{ id: "r1", status: "queued" }] })[0].status).toBe("queued");
    expect(derive({ messages, activeRuns: [{ id: "r1", status: "running" }] })[0].status).toBe("running");
    expect(derive({ messages, activeRuns: [{ id: "r1", status: "awaiting_approval" }] })[0].status).toBe("awaiting-approval");
  });

  it("is completed once the run's unit was submitted", () => {
    const state = derive({ messages: [request("r1", ["q1"])], units: [unit({})] })[0];
    expect(state).toMatchObject({ status: "completed", runId: "r1" });
  });

  it("is completed as soon as its unit is submitted, while the run grades other units", () => {
    const state = derive({
      messages: [request("r1", ["q1"])],
      activeRuns: [{ id: "r1", status: "running" }],
      units: [unit({})],
    })[0];
    expect(state).toMatchObject({ status: "completed", runId: "r1" });
  });

  it("ignores a unit from an older run", () => {
    const state = derive({ messages: [request("r1", ["q1"]), request("r2", ["q1"]), ended("r2", "completed")], units: [unit({})] })[0];
    expect(state).toMatchObject({ status: "failed", runId: "r2" });
  });

  it("treats a unit without writable answers as completed", () => {
    const state = derive({ messages: [request("r1", ["q1"]), ended("r1", "completed")],
      units: [unit({ total_count: 0, draft_count: 0, written_count: 0, status: "pending" })] })[0];
    expect(state).toMatchObject({ status: "completed", runId: "r1" });
  });

  it("explains a completed run that left its unit unsubmitted", () => {
    const state = derive({ messages: [request("r1", ["q1"]), ended("r1", "completed")],
      units: [unit({ status: "draft" })] })[0];
    expect(state).toMatchObject({ status: "failed", error: "not submitted" });
  });

  it("reports how a run ended without submitting", () => {
    expect(derive({ messages: [request("r1", ["q1"]), ended("r1", "cancelled")] })[0].status).toBe("cancelled");
    expect(derive({ messages: [request("r1", ["q1"]), ended("r1", "failed", "boom")] })[0]).toMatchObject({
      status: "failed",
      error: "boom",
    });
  });

  it("follows a plain continuation without reviving an old failure", () => {
    const messages = [request("r1", ["q1"]), ended("r1", "failed", "quota"),
      { ...request("r2", []), content: "繼續" }];
    expect(derive({ messages, activeRuns: [{ id: "r2", status: "running" }] })[0])
      .toMatchObject({ status: "running", runId: "r2" });
    expect(derive({ messages, units: [unit({ run_id: "r2" })] })[0].status).toBe("completed");
  });

  it("keeps completed units complete during a plain continuation", () => {
    const messages = [request("r1", ["q1"]), { ...request("r2", []), content: "繼續" }];
    expect(derive({ messages, activeRuns: [{ id: "r2", status: "running" }], units: [unit({})] })[0].status)
      .toBe("completed");
  });

  it("clears a historical failure after all answers are graded without inventing AI writes", () => {
    const state = derive({ questions: [question({ ungradedRows: [] })],
      messages: [request("r1", ["q1"]), ended("r1", "failed", "quota")] })[0];
    expect(state).toMatchObject({ status: "completed", writtenCount: 0 });
    expect(state.error).toBeUndefined();
  });

  it("marks a question without ungraded answers as skipped", () => {
    expect(derive({ questions: [question({ ungradedRows: [] })] })[0].status).toBe("skipped");
  });

  it("counts the AI's current writes per question", () => {
    const written = [{ examAnswerId: "a1", questionId: "q1", score: 3, feedback: "" }];
    expect(derive({ written })[0].writtenCount).toBe(1);
  });
});

describe("isUnfinished", () => {
  it("counts finished questions that still have ungraded answers", () => {
    const state = { status: "completed", ungradedCount: 2 } as BatchQuestionState;
    expect(isUnfinished(state)).toBe(true);
    expect(isUnfinished({ ...state, status: "running" })).toBe(false);
  });
});

describe("AI writes", () => {
  it("keeps only receipts the backend reports as current", () => {
    expect(currentWrites([
      { exam_answer_id: "a1", question_id: "q1", score: 3, feedback: "ok", current: true },
      { exam_answer_id: "a2", question_id: "q1", score: 2, feedback: "ok", current: false },
    ])).toEqual([{ examAnswerId: "a1", questionId: "q1", score: 3, feedback: "ok" }]);
  });

  it("reverts only answers still holding the AI's grade", () => {
    const written = [
      { examAnswerId: "a1", questionId: "q1", score: 3, feedback: "AI" },
      { examAnswerId: "a2", questionId: "q1", score: 3, feedback: "AI" },
    ];
    const rows = [row({ id: "a1", score: 3, feedback: "AI" }), row({ id: "a2", score: 4, feedback: "TA" })];
    expect(selectRevertableAnswers(written, rows)).toEqual(["a1"]);
  });
});
