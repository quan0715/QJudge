import { useMemo, type CSSProperties, type KeyboardEvent } from "react";
import { Checkmark } from "@carbon/icons-react";
import { Tag } from "@carbon/react";
import { useTranslation } from "react-i18next";
import { formatScore } from "@/features/contest/utils/scoreFormat";
import type { GradingAnswerRow } from "./gradingTypes";
import styles from "./GradingCardViewOnly.module.scss";

interface GradingCardViewOnlyProps {
  row: GradingAnswerRow;
  /** AI 從 grade.csv 讀出的建議分數。未出現 = AI 還沒評到這筆。 */
  aiScore?: number | null;
  /** AI 從 grade.csv 讀出的建議評語。 */
  aiReason?: string;
  /**
   * AI 批改流程正在跑，且該筆還沒出現在 grade.csv 的 `score` 欄。
   * 由外部判斷：`running && !resultsByAnswerId[row.id]`。
   */
  pending?: boolean;
  status?: "idle" | "pending" | "reviewable" | "submitted" | "missing";
  selected?: boolean;
  onToggleSelected?: () => void;
}

function stringifyAnswer(answer: Record<string, unknown>): string {
  const text = answer?.text;
  if (typeof text === "string" && text.trim()) return text;
  const selected = answer?.selected;
  if (typeof selected === "string" || typeof selected === "number") return String(selected);
  if (Array.isArray(selected)) return selected.join(", ");
  const code = answer?.code;
  if (typeof code === "string" && code.trim()) return code;

  try {
    return JSON.stringify(answer, null, 2);
  } catch {
    return "";
  }
}

const GradingCardViewOnly: React.FC<GradingCardViewOnlyProps> = ({
  row,
  aiScore,
  aiReason,
  pending,
  status = pending ? "pending" : "idle",
  selected = false,
  onToggleSelected,
}) => {
  const { t } = useTranslation("contest");

  const user = useMemo(
    () =>
      row.studentDisplayName === row.studentUsername
        ? row.studentDisplayName
        : `${row.studentDisplayName} (${row.studentUsername})`,
    [row.studentDisplayName, row.studentUsername],
  );

  const answerText = useMemo(() => stringifyAnswer(row.answerContent), [row.answerContent]);

  const hasOriginalScore = row.score != null;
  const hasOriginalFeedback = !!row.feedback?.trim();

  const aiScoreText = aiScore == null ? "-" : formatScore(aiScore);
  const scoreDelta =
    aiScore != null && hasOriginalScore && row.score != null ? aiScore - row.score : null;
  const deltaLabel =
    scoreDelta == null
      ? null
      : scoreDelta === 0
      ? "±0.00"
      : scoreDelta > 0
      ? `+${formatScore(scoreDelta)}`
      : `-${formatScore(Math.abs(scoreDelta))}`;
  const deltaClass =
    scoreDelta == null || scoreDelta === 0
      ? styles.deltaZero
      : scoreDelta > 0
      ? styles.deltaUp
      : styles.deltaDown;
  const aiReasonText = (aiReason ?? "").trim() || "-";
  const isPending = status === "pending";
  const scoreAnimationKey = aiScore == null ? "empty" : `${aiScore}`;
  const scoreDigits = aiScoreText.split("");
  const statusTag = {
    idle: { type: "cool-gray" as const, label: t("grading.cardStatePending", "待批改") },
    pending: { type: "blue" as const, label: t("grading.cardStateAiRunning", "AI批改中") },
    reviewable: { type: "green" as const, label: t("grading.reviewable", "可審核") },
    submitted: { type: "teal" as const, label: t("grading.submitted", "已送出") },
    missing: { type: "red" as const, label: t("grading.cardStateMissing", "未產生建議") },
  }[status];

  const interactive = !!onToggleSelected;
  const hoverTitle = interactive
    ? selected
      ? t("grading.cardClickDeselect", "點擊取消勾選")
      : t("grading.cardClickSelect", "點擊勾選此筆作答")
    : undefined;

  const handleClick = () => {
    if (!interactive) return;
    onToggleSelected?.();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!interactive) return;
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      onToggleSelected?.();
    }
  };

  return (
    <article
      className={`${styles.card} ${isPending ? styles.cardPending : ""} ${selected ? styles.cardSelected : ""} ${
        interactive ? styles.cardInteractive : ""
      }`}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive ? selected : undefined}
      title={hoverTitle}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <header className={styles.headerBlock}>
        <div className={styles.userBlock}>
          <div className={styles.user}>{user}</div>
        </div>
        <div className={styles.statusBlock}>
          <Tag type={statusTag.type} size="sm">{statusTag.label}</Tag>
        </div>
        <div
          className={`${styles.selectCell} ${selected ? styles.selectCellActive : ""}`}
          aria-hidden="true"
        >
          <span className={`${styles.selectMark} ${selected ? styles.selectMarkActive : ""}`}>
            {selected ? <Checkmark size={14} /> : null}
          </span>
        </div>
      </header>

      <section className={styles.mainRow}>
        <section className={styles.answerCol}>
          <div className={styles.label}>{t("grading.answerContent", "作答內容")}</div>
          <div className={`${styles.value} ${styles.answerBox}`}>
            {answerText || <span className={styles.muted}>-</span>}
          </div>
          <div className={styles.originalMeta}>
            <span className={styles.originalLabel}>
              {t("grading.originalScore", "原評分")}
            </span>
            <span className={styles.originalScore}>
              {hasOriginalScore ? `${formatScore(row.score)} / ${formatScore(row.maxScore)}` : "-"}
            </span>
            <span className={styles.originalLabel}>
              {t("grading.originalFeedback", "原評語")}
            </span>
            <span className={styles.originalFeedback}>
              {hasOriginalFeedback ? row.feedback : "-"}
            </span>
          </div>
        </section>

        <section className={styles.aiCol}>
          <div className={styles.aiRow}>
            <div className={styles.label}>{t("grading.aiScore", "AI 建議評分")}</div>
            {isPending ? (
              <div className={`${styles.value} ${styles.shimmer}`} aria-hidden="true">
                <span className={styles.shimmerDot} />
                <span className={styles.shimmerDot} />
                <span className={styles.shimmerDot} />
              </div>
            ) : (
              <div
                key={scoreAnimationKey}
                className={`${styles.aiScoreValue} ${
                  aiScore != null ? styles.aiScoreEntered : ""
                }`}
              >
                {aiScore == null ? (
                  aiScoreText
                ) : (
                  <span className={styles.scoreDigits} aria-label={aiScoreText}>
                    {scoreDigits.map((digit, index) => (
                      <span
                        key={`${digit}-${index}`}
                        className={styles.scoreDigit}
                        style={{ animationDelay: `${index * 42}ms` } as CSSProperties}
                        aria-hidden="true"
                      >
                        {digit}
                      </span>
                    ))}
                  </span>
                )}
                <span className={styles.aiScoreUnit}> / {formatScore(row.maxScore)}</span>
                {deltaLabel ? (
                  <span className={`${styles.aiScoreDelta} ${deltaClass}`}>{deltaLabel}</span>
                ) : null}
              </div>
            )}
          </div>

          <div className={styles.aiRow}>
            <div className={styles.label}>{t("grading.aiReason", "AI 建議評語")}</div>
            {isPending ? (
              <div className={`${styles.value} ${styles.shimmerBar}`} aria-hidden="true" />
            ) : (
              <div className={styles.value}>{aiReasonText}</div>
            )}
          </div>
        </section>
      </section>

    </article>
  );
};

export default GradingCardViewOnly;
