import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AnswerDisplay from "./AnswerDisplay";

// Keep the real Markdown and document renderers: a text-only mock hides this bug.
describe("AnswerDisplay answer formats", () => {
  it.each(["plain_text", undefined] as const)(
    "preserves literal text and whitespace for %s answers",
    (answerFormat) => {
      const text = '  a * b * c; *value*\n    cout << "< >";\n\n\ta*=2; i++; j=i;  \n<span style="color:red">literal</span><script>alert(1)</script>';
      render(
        <AnswerDisplay
          questionType="essay"
          answerContent={{ text }}
          answerFormat={answerFormat}
          options={[]}
          correctAnswer={null}
        />,
      );

      const answer = screen.getByRole("region", { name: "作答內容" });
      expect(answer.lastElementChild?.textContent).toBe(text);
      expect(answer.querySelector("em, strong, code, span, script")).toBeNull();
    },
  );

  it.each(["markdown", "markdown_math"] as const)(
    "keeps formatting for %s answers",
    (answerFormat) => {
      render(
        <AnswerDisplay
          questionType="short_answer"
          answerContent={{ text: "*value* and **bold**" }}
          answerFormat={answerFormat}
          options={[]}
          correctAnswer={null}
        />,
      );

      const answer = screen.getByRole("region", { name: "作答內容" });
      expect(answer.querySelector("em")?.textContent).toBe("value");
      expect(answer.querySelector("strong")?.textContent).toBe("bold");
    },
  );

  it("keeps reference answers and explanations formatted for plain-text questions", () => {
    render(
      <AnswerDisplay
        questionType="essay"
        answerContent={{ text: "*literal*" }}
        answerFormat="plain_text"
        options={[]}
        correctAnswer="**reference**"
        explanation="*explanation*"
      />,
    );
    expect(screen.getByRole("region", { name: "參考答案" }).querySelector("strong")?.textContent).toBe("reference");
    expect(screen.getByRole("region", { name: "詳解" }).querySelector("em")?.textContent).toBe("explanation");
  });

  it("keeps document answers ahead of the legacy text fallback", () => {
    render(
      <AnswerDisplay
        questionType="essay"
        answerFormat="open_document"
        answerContent={{
          text: "legacy fallback",
          document: {
            version: 1,
            nodes: [{ type: "paragraph", children: [{ type: "text", text: "document answer" }] }],
          },
        }}
        options={[]}
        correctAnswer={null}
      />,
    );
    expect(screen.getByText("document answer")).toBeInTheDocument();
    expect(screen.queryByText("legacy fallback")).not.toBeInTheDocument();
  });
});
