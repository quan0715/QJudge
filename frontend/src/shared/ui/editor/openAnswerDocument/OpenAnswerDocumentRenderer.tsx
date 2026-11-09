import katex from "katex";
import { useMemo } from "react";

import type {
  OpenAnswerDocument,
  OpenInlineNode,
} from "@/core/entities/contest.entity";

import { normalizeOpenAnswerDocument } from "./openAnswerDocument";
import styles from "./OpenAnswerDocumentEditor.module.scss";

function MathView({ latex, display = false }: { latex: string; display?: boolean }) {
  const html = useMemo(() => {
    if (!latex) return "";
    try {
      return katex.renderToString(latex, {
        throwOnError: false,
        displayMode: display,
      });
    } catch {
      return latex;
    }
  }, [latex, display]);

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
          node.children.length === 1 && node.children[0].type === "math"
            ? <div className={styles.renderedBlock} key={index}><MathView latex={node.children[0].latex} display /></div>
            : <p key={index}>{node.children.map((child, childIndex) => <InlineView key={childIndex} node={child} />)}</p>
        ))}
      </div>
    </div>
  );
}

export default OpenAnswerDocumentRenderer;
