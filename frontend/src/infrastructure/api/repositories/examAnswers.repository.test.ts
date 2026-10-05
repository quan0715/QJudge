import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getExamResults, getExamAnswerDraft, saveExamAnswerDraft, submitExamAnswer } from "./examAnswers.repository";

describe("getExamResults", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps only flattened current-question fields", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 1,
              question_id: "question-1",
              answer: { text: "answer" },
              created_at: "2026-08-10T00:00:00Z",
              updated_at: "2026-08-10T00:00:00Z",
              is_correct: null,
              score: "8.00",
              feedback: "",
              graded_by_username: null,
              graded_at: null,
              question_prompt: "Current prompt",
              question_explanation: "Current explanation",
              effective_score: 12,
              effective_max_score: 15,
            },
          ],
          meta: { total_score: 12, max_total_score: 15 },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const results = await getExamResults("contest-1");

    expect(results.answers[0]).toMatchObject({
      questionId: "question-1",
      questionPrompt: "Current prompt",
      questionExplanation: "Current explanation",
      score: 8,
      effectiveScore: 12,
      effectiveMaxScore: 15,
    });
    expect(results.answers[0]).not.toHaveProperty("questionSnapshot");
    expect(results).toMatchObject({ totalScore: 12, maxTotalScore: 15 });
  });
});


describe("exam answer draft lifetime", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("preserves a newer unsent draft when an earlier save completes", async () => {
    let resolveSave!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { resolveSave = resolve; }));
    const oldAnswer = { text: "already sending" };
    const save = submitExamAnswer("contest-1", "q1", oldAnswer);
    const newAnswer = { text: "latest unsent edit" };
    saveExamAnswerDraft("contest-1", "q1", newAnswer);
    resolveSave(new Response(JSON.stringify({ id: 1, question_id: "q1", answer: oldAnswer,
      created_at: "2026-10-05T00:00:00Z", updated_at: "2026-10-05T00:00:00Z" }), { status: 200 }));
    await save;
    expect(getExamAnswerDraft("contest-1", "q1")).toEqual(newAnswer);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 1, question_id: "q1", answer: newAnswer,
      created_at: "2026-10-05T00:00:00Z", updated_at: "2026-10-05T00:00:00Z" }), { status: 200 }));
    await submitExamAnswer("contest-1", "q1", newAnswer);
    expect(getExamAnswerDraft("contest-1", "q1")).toBeNull();
  });
});
