import type {
  OpenAnswerDocument,
  OpenAnswerNode,
  OpenInlineNode,
} from "@/core/entities/contest.entity";

export type {
  OpenAnswerDocument,
  OpenAnswerNode,
  OpenInlineNode,
};

export interface OpenAnswerSerialized {
  plainText: string;
  gradingText: string;
}

export const createTextInlineNode = (text = ""): OpenInlineNode => ({
  type: "text",
  text,
});

export const createMathInlineNode = (latex = ""): OpenInlineNode => ({
  type: "math",
  latex,
});

export const createEmptyOpenAnswerDocument = (): OpenAnswerDocument => ({
  version: 1,
  nodes: [{ type: "paragraph", children: [] }],
});

export function isOpenAnswerDocument(value: unknown): value is OpenAnswerDocument {
  if (!value || typeof value !== "object") return false;
  const document = value as Partial<OpenAnswerDocument>;
  if (document.version !== 1 || !Array.isArray(document.nodes)) return false;
  return document.nodes.every(
    (node) =>
      node?.type === "paragraph" &&
      Array.isArray(node.children) &&
      node.children.every(
        (child) =>
          (child?.type === "text" && typeof child.text === "string") ||
          (child?.type === "math" && typeof child.latex === "string"),
      ),
  );
}

export function normalizeOpenAnswerDocument(
  value: unknown,
): OpenAnswerDocument {
  if (!isOpenAnswerDocument(value)) return createEmptyOpenAnswerDocument();
  if (value.nodes.length === 0) return createEmptyOpenAnswerDocument();
  return value;
}

export function serializeOpenAnswerDocument(
  document: OpenAnswerDocument,
): OpenAnswerSerialized {
  const text = document.nodes
    .map((node) => serializeInlineNodes(node.children))
    .join("\n")
    .trim();
  return { plainText: text, gradingText: text };
}

export function serializeInlineNodes(nodes: OpenInlineNode[]): string {
  return nodes.map(serializeInlineNode).join("");
}

export function serializeInlineNode(node: OpenInlineNode): string {
  if (node.type === "text") return node.text;
  return `$${node.latex}$`;
}
