import { useTranslation } from "react-i18next";
import type { ExamQuestionGroup } from "@/core/entities/contest.entity";
import { formatScore } from "@/features/contest/utils/scoreFormat";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import styles from "./ExamQuestionCard.module.scss";

export default function ExamQuestionGroupStem({ group, label }: {
  group: ExamQuestionGroup;
  label?: string;
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
            score: formatScore(group.totalScore),
            defaultValue: "小計 {{score}} 分",
          })}
        </span>
      </div>
      <MarkdownRenderer enableMath enableHighlight>
        {group.sharedStemMarkdown}
      </MarkdownRenderer>
    </section>
  );
}
