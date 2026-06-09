import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createExamPaperBlock,
  deleteExamPaperBlock,
  getExamPaper,
  reorderExamPaperBlocks,
  updateExamPaperBlock,
} from "./examPaper.repository";

describe("getExamPaper", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    document.cookie = "csrftoken=test-csrf-token";
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.cookie = "csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    window.localStorage.clear();
  });

  it("loads the composite exam paper endpoint and maps grouped questions", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          groups: [
            {
              id: 7,
              contest: 3,
              title: "題組一",
              shared_stem_markdown: "共同題幹",
              order: 1,
              total_score: 10,
            },
          ],
          questions: [
            {
              id: 11,
              contest: 3,
              question_type: "essay",
              prompt: "第一小題",
              score: 10,
              order: 1,
              group_id: 7,
              order_in_group: 1,
              answer_format: "markdown_math",
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await getExamPaper("contest-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/contests/contest-1/exam-paper/");
    expect(options.method).toBe("GET");
    expect(result.questions[0].answerFormat).toBe("markdown_math");
    expect(result.sections[0].kind).toBe("group");
  });

  it("writes block mutations through the composite exam paper endpoint", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            kind: "group",
            id: "group-1",
            group: {
              id: "group-1",
              title: "新題組",
              shared_stem_markdown: "共同題幹",
              order: 0,
              total_score: 0,
            },
            children: [],
          }),
          {
            status: 201,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            kind: "question",
            id: "question-1",
            question: {
              id: "question-1",
              contest: "contest-1",
              question_type: "essay",
              prompt: "更新後題目",
              score: 5,
              order: 0,
              answer_format: "markdown_math",
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            questions: [],
            groups: [],
            blocks: [],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const created = await createExamPaperBlock("contest-1", {
      kind: "group",
      group: {
        title: "新題組",
        shared_stem_markdown: "共同題幹",
      },
    });
    const updated = await updateExamPaperBlock("contest-1", "question-1", {
      kind: "question",
      question: {
        prompt: "更新後題目",
        answer_format: "markdown_math",
      },
    });
    const reordered = await reorderExamPaperBlocks("contest-1", [
      { kind: "group", id: "group-1" },
      { kind: "question", id: "question-1" },
    ]);
    await deleteExamPaperBlock("contest-1", "group-1");

    expect(created.kind).toBe("group");
    expect(updated.kind).toBe("question");
    expect(reordered.blocks).toEqual([]);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/contests/contest-1/exam-paper/",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/contests/contest-1/exam-paper/question-1/",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/v1/contests/contest-1/exam-paper/",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/v1/contests/contest-1/exam-paper/group-1/",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
