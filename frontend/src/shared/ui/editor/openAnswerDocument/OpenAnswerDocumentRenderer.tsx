import katex from "katex";
import { useMemo } from "react";

import type {
  OpenAnswerDocument,
  OpenInlineNode,
} from "@/core/entities/contest.entity";

import { normalizeOpenAnswerDocument } from "./openAnswerDocument";
import styles from "./OpenAnswerDocumentEditor.module.scss";

function MathView({ latex }: { latex: string }) {
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

  if (!latex) return null;
  return (
    <span
      className={styles.mathRender}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function InlineView({ node }: { node: OpenInlineNode }) {
  if (node.type === "text") return <span>{node.text}</span>;
  return (
    <span className={styles.mathToken}>
      <MathView latex={node.latex} />
    </span>
  );
}

export function OpenAnswerDocumentRenderer({
  document,
}: {
  document: OpenAnswerDocument;
}) {
  const normalized = useMemo(
    () => normalizeOpenAnswerDocument(document),
    [document],
  );

  return (
    <div className={styles.sheet}>
      <div className={styles.editorSurface}>
        {normalized.nodes.map((node, index) => (
          <p key={index}>
            {node.children.map((child, childIndex) => (
              <InlineView key={childIndex} node={child} />
            ))}
          </p>
        ))}
      </div>
    </div>
  );
}

export default OpenAnswerDocumentRenderer;
