import { Tag } from "@carbon/react";

import type { ExamQuestionType } from "@/core/entities/contest.entity";
import AnswerDisplay from "@/features/contest/components/exam/AnswerDisplay";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";

import styles from "./PaperQuestionReportCard.module.scss";

type StatusTone =
  | "red"
  | "magenta"
  | "purple"
  | "blue"
  | "cyan"
  | "teal"
  | "green"
  | "gray"
  | "cool-gray"
  | "warm-gray"
  | "high-contrast"
  | "outline";

interface PaperQuestionReportCardProps {
  questionId: string;
  index: number;
  questionType: ExamQuestionType;
  typeLabel: string;
  prompt: string;
  options: string[];
  answer: Record<string, unknown>;
  statusLabel: string;
  statusTone: StatusTone;
  statusEmphasis?: "warning";
  showGrading?: boolean;
  score?: number | null;
  maxScore: number;
  gradedByUsername?: string | null;
  feedback?: string | null;
  correctAnswer?: unknown;
  explanation?: string | null;
}

export default function PaperQuestionReportCard({
  index,
  questionType,
  typeLabel,
  prompt,
  options,
  answer,
  statusLabel,
  statusTone,
  statusEmphasis,
  showGrading = false,
  score,
  maxScore,
  gradedByUsername,
  feedback,
  correctAnswer,
  explanation,
}: PaperQuestionReportCardProps) {
  return (
    <article className={styles.root}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>
            Q{index} · {typeLabel}
          </div>
          {showGrading ? (
            <div className={styles.meta}>
              {score ?? "-"} / {maxScore}
              {gradedByUsername ? ` · ${gradedByUsername}` : ""}
            </div>
          ) : null}
        </div>
        <Tag
          type={statusTone}
          className={statusEmphasis === "warning" ? styles.warningTag : undefined}
        >
          {statusLabel}
        </Tag>
      </div>
      <div className={styles.body}>
        <div className={styles.markdownBlock}>
          <MarkdownRenderer enableMath enableHighlight>
            {prompt}
          </MarkdownRenderer>
        </div>
        <AnswerDisplay
          questionType={questionType}
          answerContent={answer}
          options={options}
          correctAnswer={showGrading ? correctAnswer : undefined}
          explanation={showGrading ? explanation : null}
          showCorrectness={showGrading}
        />
        {showGrading && feedback?.trim() ? (
          <div>
            <div className={styles.feedbackLabel}>批改評語</div>
            <div className={styles.feedbackBlock}>
              <MarkdownRenderer enableMath enableHighlight>
                {feedback}
              </MarkdownRenderer>
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}
