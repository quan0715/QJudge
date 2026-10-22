import { describe, expect, it } from "vitest";
import { normalizeMarkdownText } from "./markdownText";

describe("normalizeMarkdownText", () => {
  it("normalizes streaming newlines while preserving markdown paragraphs", () => {
    expect(
      normalizeMarkdownText("  第一段\r\n\r\n\r\n\r\n第二段  \n\n\n- item  \n")
    ).toBe("第一段\n\n第二段\n\n- item");
  });
});
