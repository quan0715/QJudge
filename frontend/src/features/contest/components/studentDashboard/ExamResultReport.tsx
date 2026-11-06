import { useTranslation } from "react-i18next";
import { ExamAnswerTiles, type ExamResultTile } from "../exam/ExamAnswerTiles";

import styles from "./ExamResultReport.module.scss";

export type { ExamResultTile, ExamResultTileState } from "../exam/ExamAnswerTiles";

export interface ExamClassStanding {
  average: number;
  max: number;
  /** The student's own total, when the paper has been graded. */
  score: number | null;
  /** Ten buckets from 0–9% up to 90–100%. */
  distribution: number[];
}

interface ExamResultReportProps {
  tiles: ExamResultTile[];
  /** Leave out when the teacher keeps the class average private. */
  classStanding?: ExamClassStanding;
  onOpenDetails?: () => void;
  formatScore: (value: number) => string;
}

/** After the exam: one tile per question, and how the class did when that is shared. */
export function ExamResultReport({ tiles, classStanding, onOpenDetails, formatScore }: ExamResultReportProps) {
  const { t } = useTranslation("contest");

  return (
    <div className={styles.report} data-with-class={!!classStanding}>
      <section className={styles.answers} aria-labelledby="exam-report-answers">
        <header className={styles.head}>
          <h3 id="exam-report-answers">{t("workspace.report.title", "作答情況")}</h3>
          {onOpenDetails && (
            <button type="button" className={styles.more} onClick={onOpenDetails}>
              {t("workspace.report.details", "查看詳情")}
              <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="m6 3.5 4.5 4.5L6 12.5" /></svg>
            </button>
          )}
        </header>
        <ExamAnswerTiles tiles={tiles} />
      </section>

      {classStanding && <ClassStanding standing={classStanding} formatScore={formatScore} />}
    </div>
  );
}

function ClassStanding({ standing, formatScore }: { standing: ExamClassStanding; formatScore: (value: number) => string }) {
  const { t } = useTranslation("contest");
  const peak = Math.max(1, ...standing.distribution);
  const ownBucket = standing.score === null || standing.max <= 0
    ? -1
    : Math.min(9, Math.floor((standing.score / standing.max) * 10));
  const diff = standing.score === null ? null : standing.score - standing.average;
  const comparison = diff === null
    ? null
    : Math.abs(diff) < 0.005
      ? t("workspace.report.atAverage", "與平均相同")
      : diff > 0
        ? t("workspace.report.aboveAverage", `高於平均 ${formatScore(diff)} 分`, { diff: formatScore(diff) })
        : t("workspace.report.belowAverage", `低於平均 ${formatScore(-diff)} 分`, { diff: formatScore(-diff) });

  return (
    <section className={styles.standing} aria-labelledby="exam-report-class">
      <header className={styles.head}>
        <h3 id="exam-report-class">{t("workspace.report.classTitle", "班級表現")}</h3>
      </header>
      <dl className={styles.figures}>
        <div>
          <dt>{t("workspace.report.average", "班平均")}</dt>
          <dd>{formatScore(standing.average)}<small> / {formatScore(standing.max)}</small></dd>
        </div>
        {comparison && (
          <div>
            <dt>{t("workspace.report.you", "你的分數")}</dt>
            <dd>{formatScore(standing.score ?? 0)}<small> {comparison}</small></dd>
          </div>
        )}
      </dl>
      <ol className={styles.histogram} aria-label={t("workspace.report.distribution", "成績分布")}>
        {standing.distribution.map((count, index) => {
          const range = index === 9 ? "90–100%" : `${index * 10}–${index * 10 + 9}%`;
          return (
            <li key={range} data-own={index === ownBucket} title={`${range}：${count}`}>
              <span style={{ height: `${Math.max(count > 0 ? 8 : 2, (count / peak) * 100)}%` }} />
              <span className={styles.srOnly}>
                {range}，{t("workspace.report.people", `${count} 人`, { count })}
                {index === ownBucket ? `，${t("workspace.report.yourRange", "你在這裡")}` : ""}
              </span>
            </li>
          );
        })}
      </ol>
      <div className={styles.axis} aria-hidden="true"><span>0</span><span>{formatScore(standing.max)}</span></div>
    </section>
  );
}
