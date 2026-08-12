import MarkdownContent from "@/shared/ui/markdown/MarkdownContent";
import styles from "./ExamQuestionPrompt.module.scss";

interface ExamQuestionPromptProps {
  content?: string | null;
  emptyText: string;
  compact?: boolean;
  ariaLabel?: string;
}

export default function ExamQuestionPrompt({
  content,
  emptyText,
  compact = false,
  ariaLabel,
}: ExamQuestionPromptProps) {
  if (content?.trim()) {
    return (
      <div
        className={`${styles.prompt} ${compact ? styles.promptNoMargin : ""}`.trim()}
        role={ariaLabel ? "region" : undefined}
        aria-label={ariaLabel}
      >
        <MarkdownContent.Problem>{content}</MarkdownContent.Problem>
      </div>
    );
  }

  return (
    <div
      className={`${styles.promptEmpty} ${compact ? styles.promptEmptyNoMargin : ""}`.trim()}
      role={ariaLabel ? "region" : undefined}
      aria-label={ariaLabel}
    >
      {emptyText}
    </div>
  );
}
