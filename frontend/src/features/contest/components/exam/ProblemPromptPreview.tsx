import type { CSSProperties } from "react";
import MarkdownContent from "@/shared/ui/markdown/MarkdownContent";
import styles from "./ProblemPromptPreview.module.scss";

interface ProblemPromptPreviewProps {
  content?: string | null;
  className?: string;
  emptyText?: string;
  maxLines?: number;
}

export function ProblemPromptPreview({
  content,
  className,
  emptyText,
  maxLines = 2,
}: ProblemPromptPreviewProps) {
  const trimmed = content?.trim();
  const classes = [styles.preview, className].filter(Boolean).join(" ");
  const style = {
    "--problem-prompt-preview-lines": String(maxLines),
  } as CSSProperties;

  if (!trimmed) {
    return emptyText ? (
      <span className={`${classes} ${styles.empty}`}>{emptyText}</span>
    ) : null;
  }

  return (
    <MarkdownContent.Problem className={classes} style={style}>
      {content ?? ""}
    </MarkdownContent.Problem>
  );
}

export default ProblemPromptPreview;
