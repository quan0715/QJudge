import { useMemo } from "react";
import { Button, Tag } from "@carbon/react";
import { useTranslation } from "react-i18next";
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
  status?: "idle" | "pending" | "reviewable" | "missing";
  selected?: boolean;
  onToggleSelected?: () => void;
  onRetry?: () => void;
  onSubmit?: () => void;
  actionsDisabled?: boolean;
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
  onRetry,
  onSubmit,
  actionsDisabled = true,
}) => {
  const { t } = useTranslation("contest");

  const user = useMemo(
    () =>
      row.studentNickname === row.studentUsername
        ? row.studentNickname
        : `${row.studentNickname} (${row.studentUsername})`,
    [row.studentNickname, row.studentUsername],
  );

  const answerText = useMemo(() => stringifyAnswer(row.answerContent), [row.answerContent]);

  const aiScoreText = aiScore == null ? "-" : `${aiScore}`;
  const aiReasonText = (aiReason ?? "").trim() || "-";
  const isPending = status === "pending";
  const statusTag = {
    idle: { type: "cool-gray" as const, label: t("grading.cardStatePending", "待批改") },
    pending: { type: "blue" as const, label: t("grading.cardStateAiRunning", "AI批改中") },
    reviewable: { type: "green" as const, label: t("grading.reviewable", "可審核") },
    missing: { type: "red" as const, label: t("grading.cardStateMissing", "未產生建議") },
  }[status];

  return (
    <article className={`${styles.card} ${selected ? styles.cardSelected : ""}`}>
      <header className={styles.headerBlock}>
        <button
          type="button"
          className={`${styles.selectCell} ${selected ? styles.selectCellActive : ""}`}
          onClick={onToggleSelected}
          aria-pressed={selected}
          aria-label={selected ? t("common.selected", "已選取") : t("common.select", "選取")}
        >
          <span className={styles.selectMark}>{selected ? "✓" : ""}</span>
        </button>
        <div className={styles.userBlock}>
          <div className={styles.user}>{user}</div>
        </div>
        <div className={styles.statusBlock}>
          <Tag type={statusTag.type} size="sm">{statusTag.label}</Tag>
        </div>
      </header>

      <section className={styles.mainRow}>
        <section className={styles.answerCol}>
          <div className={styles.label}>{t("grading.answerContent", "作答內容")}</div>
          <div className={`${styles.value} ${styles.answerBox}`}>
            {answerText || <span className={styles.muted}>-</span>}
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
              <div className={styles.aiScoreValue}>
                {aiScoreText}
                <span className={styles.aiScoreUnit}> / {row.maxScore}</span>
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

      <footer className={styles.actionBlock}>
        <Button
          kind="ghost"
          disabled={actionsDisabled || !onRetry}
          onClick={onRetry}
        >
          {t("grading.retryAiGrading", "重改")}
        </Button>
        <Button
          kind="primary"
          disabled={actionsDisabled || !onSubmit}
          onClick={onSubmit}
        >
          {t("grading.publish", "送出")}
        </Button>
      </footer>
    </article>
  );
};

export default GradingCardViewOnly;
