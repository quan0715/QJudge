import { Accordion, AccordionItem, ProgressBar, Tag } from "@carbon/react";
import { useTranslation } from "react-i18next";
import { questionTypeLabel } from "@/features/contest/screens/settings/grading/gradingTypes";
import type { QuestionStatistics } from "./useExamStatistics";
import styles from "./ExamStatisticsPanel.module.scss";

interface QuestionStatisticsDetailProps {
  stat: QuestionStatistics;
}

export default function QuestionStatisticsDetail({
  stat,
}: QuestionStatisticsDetailProps) {
  const { t } = useTranslation("contest");
  const optionLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const progressPercent =
    stat.totalAnswers > 0
      ? Math.round((stat.gradedCount / stat.totalAnswers) * 100)
      : 0;

  return (
    <div className={styles.detailRoot}>
      <div className={styles.detailHeader}>
        <span className={styles.detailTitle}>Q{stat.questionIndex}</span>
        <Tag type="blue" size="sm">
          {questionTypeLabel[stat.questionType]}
        </Tag>
        <Tag type={progressPercent === 100 ? "green" : "gray"} size="sm">
          {t("statistics.gradedCount", "{{graded}}/{{total}} 已批改", {
            graded: stat.gradedCount,
            total: stat.totalAnswers,
          })}
        </Tag>
      </div>

      <div className={styles.averageSection}>
        <span className={styles.averageLabel}>{t("statistics.averageScore", "平均分數")}</span>
        <span className={styles.averageValue}>
          {stat.averageScore.toFixed(1)} / {stat.maxScore}
        </span>
        <ProgressBar
          label={t("statistics.averageScoreRatio", "平均分數比例")}
          hideLabel
          value={stat.maxScore > 0 ? (stat.averageScore / stat.maxScore) * 100 : 0}
          size="small"
        />
      </div>

      {stat.isObjective ? (
        <div className={styles.distributionSection}>
          <span className={styles.sectionTitle}>{t("statistics.optionDistribution", "選項分布")}</span>
          {stat.totalAnswers === 0 && (
            <span className={styles.emptyHint}>{t("statistics.noRecords", "目前尚無作答紀錄")}</span>
          )}
          {(stat.optionDistribution ?? []).map((opt, idx) => (
            <div key={idx} className={styles.optionRow}>
              <span className={styles.optionLabel} title={opt.label}>
                <span className={styles.optionPrefix}>
                  {optionLetters[idx] ?? idx + 1}.
                </span>
                <span className={styles.optionText}>{opt.label}</span>
              </span>
              <div className={styles.optionBarWrap}>
                <div
                  className={`${styles.optionBar} ${
                    opt.isCorrect ? styles.optionBarCorrect : styles.optionBarWrong
                  }`}
                  style={{
                    width: `${opt.count > 0 ? Math.max(opt.percent, 4) : 0}%`,
                  }}
                />
              </div>
              <span className={styles.optionCount}>
                {opt.count} ({opt.percent}%)
              </span>
              <span className={styles.correctMark}>
                {opt.isCorrect ? "\u2713" : ""}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.distributionSection}>
          <span className={styles.sectionTitle}>{t("statistics.studentAnswers", "學生作答")}</span>
          <Accordion>
            {(stat.subjectiveEntries ?? []).map((entry, idx) => (
              <AccordionItem
                key={idx}
                title={`${entry.studentNickname} — ${
                  entry.score !== null
                    ? t("statistics.scoreUnit", "{{score}} 分", {
                        score: entry.score,
                      })
                    : t("statistics.notGraded", "未批改")
                }`}
              >
                <p style={{ whiteSpace: "pre-wrap", fontSize: "0.875rem" }}>
                  {entry.answerText || t("statistics.notAnswered", "(未作答)")}
                </p>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      )}
    </div>
  );
}
