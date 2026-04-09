import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import styles from "./ExamQuestionPrompt.module.scss";

interface ExamQuestionPromptProps {
  content?: string | null;
  emptyText: string;
  compact?: boolean;
}

export default function ExamQuestionPrompt({
  content,
  emptyText,
  compact = false,
}: ExamQuestionPromptProps) {
  if (content?.trim()) {
    return (
      <div
        className={`${styles.prompt} ${compact ? styles.promptNoMargin : ""}`.trim()}
      >
        <MarkdownRenderer enableHighlight enableCopy>{content}</MarkdownRenderer>
      </div>
    );
  }

  return (
    <div
      className={`${styles.promptEmpty} ${compact ? styles.promptEmptyNoMargin : ""}`.trim()}
    >
      {emptyText}
    </div>
  );
}
