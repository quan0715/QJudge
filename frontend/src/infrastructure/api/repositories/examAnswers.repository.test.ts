import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getExamResults } from "./examAnswers.repository";

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
        JSON.stringify([
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
          },
        ]),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const results = await getExamResults("contest-1");

    expect(results[0]).toMatchObject({
      questionId: "question-1",
      questionPrompt: "Current prompt",
      questionExplanation: "Current explanation",
    });
    expect(results[0]).not.toHaveProperty("questionSnapshot");
  });
});
