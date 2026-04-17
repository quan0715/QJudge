import { describe, it, expect } from "vitest";
import { stripMarkdown } from "./stringUtils";

describe("stripMarkdown", () => {
  it("should remove common markdown characters", () => {
    const input = "# Title\n**Bold** and *italic*\n- List item\n[Link](url)\n![Image](img)";
    const expected = "Title Bold and italic List item Linkurl Imageimg";
    expect(stripMarkdown(input)).toBe(expected);
  });

  it("should truncate strings longer than maxLen", () => {
    const input = "This is a very long string that should be truncated to a shorter length.";
    const maxLen = 10;
    const result = stripMarkdown(input, maxLen);
    expect(result).toBe("This is a …");
  });

  it("should not truncate strings shorter than maxLen", () => {
    const input = "Short string";
    const maxLen = 50;
    expect(stripMarkdown(input, maxLen)).toBe("Short string");
  });

  it("should handle empty strings", () => {
    expect(stripMarkdown("")).toBe("");
  });

  it("should replace multiple newlines with a single space", () => {
    const input = "Line 1\n\n\nLine 2";
    expect(stripMarkdown(input)).toBe("Line 1 Line 2");
  });
});
