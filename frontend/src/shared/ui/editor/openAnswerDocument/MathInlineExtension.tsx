import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import katex from "katex";
import { useMemo } from "react";

import styles from "./OpenAnswerDocumentEditor.module.scss";

export const MATH_INLINE_NAME = "mathInline";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    [MATH_INLINE_NAME]: {
      insertMathInline: (latex: string) => ReturnType;
      updateMathInline: (latex: string) => ReturnType;
    };
  }
}

function MathInlineNodeView({ node, selected }: NodeViewProps) {
  const latex = (node.attrs.latex as string) ?? "";
  const html = useMemo(() => {
    if (!latex) return "";
    try {
      return katex.renderToString(latex, {
        throwOnError: false,
        displayMode: false,
      });
    } catch {
      return latex;
    }
  }, [latex]);

  return (
    <NodeViewWrapper
      as="span"
      className={`${styles.mathToken} ${selected ? styles.mathTokenSelected : ""}`}
      data-math-inline
      data-empty={latex ? undefined : "true"}
    >
      <span
        className={styles.mathRender}
        contentEditable={false}
        dangerouslySetInnerHTML={{ __html: latex ? html : "fx" }}
      />
    </NodeViewWrapper>
  );
}

export const MathInlineExtension = Node.create({
  name: MATH_INLINE_NAME,
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      latex: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-latex") ?? "",
        renderHTML: (attributes) => ({
          "data-latex": (attributes.latex as string) ?? "",
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-math-inline]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-math-inline": "" }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathInlineNodeView);
  },

  addCommands() {
    return {
      insertMathInline:
        (latex: string) =>
        ({ chain }) =>
          chain()
            .insertContent({ type: this.name, attrs: { latex } })
            .run(),
      updateMathInline:
        (latex: string) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { latex }),
    };
  },
});

export default MathInlineExtension;
