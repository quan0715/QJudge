import { describe, expect, it } from "vitest";

import {
  createMathInlineNode,
  createTextInlineNode,
  isOpenAnswerDocument,
  normalizeOpenAnswerDocument,
  serializeOpenAnswerDocument,
} from "./openAnswerDocument";

describe("open answer document", () => {
  it("recognizes versioned open answer documents", () => {
    expect(isOpenAnswerDocument({ version: 1, nodes: [] })).toBe(true);
    expect(isOpenAnswerDocument({ version: 2, nodes: [] })).toBe(false);
    expect(isOpenAnswerDocument("not a document")).toBe(false);
  });

  it("serializes latex math nodes into plain text with $...$ markers", () => {
    const document = {
      version: 1 as const,
      nodes: [
        {
          type: "paragraph" as const,
          children: [
            createTextInlineNode("x = "),
            createMathInlineNode("\\frac{1}{2}"),
          ],
        },
      ],
    };

    expect(serializeOpenAnswerDocument(document)).toEqual({
      plainText: "x = $\\frac{1}{2}$",
      gradingText: "x = $\\frac{1}{2}$",
    });
  });

  it("rejects documents whose math nodes are not latex-shaped", () => {
    expect(
      isOpenAnswerDocument({
        version: 1,
        nodes: [
          {
            type: "paragraph",
            children: [{ type: "math", template: "fraction", fields: {} }],
          },
        ],
      }),
    ).toBe(false);
  });

  it("normalizes empty / invalid input to an empty document", () => {
    expect(normalizeOpenAnswerDocument(null).nodes).toEqual([
      { type: "paragraph", children: [] },
    ]);
    expect(normalizeOpenAnswerDocument({ version: 1, nodes: [] }).nodes).toEqual([
      { type: "paragraph", children: [] },
    ]);
  });
});
