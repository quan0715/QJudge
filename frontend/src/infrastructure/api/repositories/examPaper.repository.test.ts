import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getExamPaper } from "./examPaper.repository";

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
});
