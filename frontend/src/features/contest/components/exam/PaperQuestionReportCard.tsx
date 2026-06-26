import { Tag } from "@carbon/react";

import type {
  ExamQuestionAnswerFormat,
  ExamQuestionType,
  OpenAnswerDocument,
} from "@/core/entities/contest.entity";
import AnswerDisplay from "@/features/contest/components/exam/AnswerDisplay";
import { formatScore } from "@/features/contest/utils/scoreFormat";
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
  answerFormat?: ExamQuestionAnswerFormat;
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
  referenceAnswerDocument?: OpenAnswerDocument | null;
  explanationDocument?: OpenAnswerDocument | null;
  scorePolicy?: string;
}

export default function PaperQuestionReportCard({
  index,
  questionType,
  answerFormat,
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
  referenceAnswerDocument,
  explanationDocument,
  scorePolicy,
}: PaperQuestionReportCardProps) {
  const isExcluded = scorePolicy === "excluded";
  const isFullMarks = scorePolicy === "full_marks";
  const isRedistribute = scorePolicy === "redistribute";
  const scoreText = isRedistribute
    ? "— / —"
    : `${isExcluded ? "—" : formatScore(score)} / ${formatScore(maxScore)}`;

  return (
    <article className={styles.root}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>
            Q{index} · {typeLabel}
            {isExcluded && <span className={styles.policyExcluded}> (不計分)</span>}
            {isFullMarks && <span className={styles.policyFullMarks}> (送分)</span>}
            {isRedistribute && <span className={styles.policyExcluded}> (配分重分配)</span>}
          </div>
          {showGrading ? (
            <div className={styles.meta}>
              {scoreText}
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
          answerFormat={answerFormat}
          answerContent={answer}
          options={options}
          correctAnswer={showGrading ? correctAnswer : undefined}
          explanation={showGrading ? explanation : null}
          referenceAnswerDocument={showGrading ? referenceAnswerDocument : null}
          explanationDocument={showGrading ? explanationDocument : null}
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
