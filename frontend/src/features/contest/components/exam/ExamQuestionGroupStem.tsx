import { useTranslation } from "react-i18next";
import type { ExamQuestionGroup } from "@/core/entities/contest.entity";
import { formatScore, formatScoreCompact } from "@/features/contest/utils/scoreFormat";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import styles from "./ExamQuestionCard.module.scss";

export default function ExamQuestionGroupStem({ group, label, compactScore = false }: {
  group: ExamQuestionGroup;
  label?: string;
  /** Student workspace shows "5 分" instead of "5.00 分". */
  compactScore?: boolean;
}) {
  const { t } = useTranslation("contest");
  return (
    <section className={styles.groupStem} aria-label={t("answering.group.sharedStem")}>
      <div className={styles.groupStemHeader}>
        <span className={styles.groupStemTitle}>
          {label ? `${label}.` : group.title || t("answering.group.sharedStem")}
          {label && group.title ? ` · ${group.title}` : ""}
        </span>
        <span className={styles.groupStemScore}>
          {t("answering.group.totalScore", {
            score: compactScore ? formatScoreCompact(group.totalScore) : formatScore(group.totalScore),
            defaultValue: "小計 {{score}} 分",
          })}
        </span>
      </div>
      <div className={styles.prompt}>
        <MarkdownRenderer enableMath enableHighlight>
          {group.sharedStemMarkdown}
        </MarkdownRenderer>
      </div>
    </section>
  );
}
