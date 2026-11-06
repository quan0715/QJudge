import { useState, type CSSProperties, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { useTranslation } from "react-i18next";
import { useInterval } from "@/shared/hooks/useInterval";
import { formatCountdown } from "../../hooks/useContestTimers";
import { formatExamTime } from "../../utils/examWorkspaceFormat";
import styles from "./ExamWorkspaceShell.module.scss";

export interface ExamOverviewFact {
  key: string;
  label: string;
  value: ReactNode;
}

export interface ExamOverviewSchedule {
  startTime: string;
  endTime: string;
  duration: ReactNode;
  serverTimeOffsetMs?: number;
}

export interface ExamOverviewGrade {
  score: string;
  max: string;
  /** Read by screen readers, e.g. "考試成績". */
  label: string;
}

export interface ExamOverviewProgress {
  done: number;
  total: number;
  /** "已通過" for coding, "已作答" for paper exams. */
  label: string;
}

interface ExamOverviewLayoutProps {
  /** Small line above the title; leave it out when it would reveal the paper. */
  kicker?: ReactNode;
  title: string;
  description: string;
  rules?: { title: string; body: string } | null;
  schedule?: ExamOverviewSchedule;
  /** Published score, marked on the paper like a teacher's red pen. */
  grade?: ExamOverviewGrade;
  /** After the exam: per-question results and class standing, above the footer. */
  report?: ReactNode;
  progress?: ExamOverviewProgress;
  /** Extra figures next to the progress, e.g. the published score. */
  facts?: ExamOverviewFact[];
  /** Primary actions, right of the facts. */
  actions?: ReactNode;
  /** Secondary content below the summary, e.g. records or clarifications. */
  details?: ReactNode;
  ariaLabel?: string;
}

/** One overview layout for trial runs and the formal student exam page. */
export function ExamOverviewLayout({ kicker, title, description, rules, schedule, grade, report, progress, facts = [], actions, details, ariaLabel }: ExamOverviewLayoutProps) {
  const rulesSection = rules && (
    <section className={styles.rules}>
      <h3>{rules.title}</h3>
      <div className={styles.prose}><ReactMarkdown>{rules.body}</ReactMarkdown></div>
    </section>
  );
  return (
    <section className={styles.overview} data-has-details={!!details} aria-label={ariaLabel ?? title}>
      <div className={styles.hero} data-graded={!!grade}>
        {grade && <GradeMark grade={grade} />}
        {kicker && <span className={styles.kicker}>{kicker}</span>}
        <h2 className={styles.heroTitle}>{title}</h2>
        <div className={styles.prose}><ReactMarkdown>{description}</ReactMarkdown></div>
        {!report && rulesSection}
      </div>
      {/* After the exam the results lead; the rules follow for reference. */}
      {report}
      {report && rulesSection && <div className={styles.rulesAfterReport}>{rulesSection}</div>}
      <footer className={styles.overviewFooter}>
        {schedule && <ScheduleBar schedule={schedule} />}
        <div className={styles.overviewSummary}>
          {progress && <ProgressRing progress={progress} />}
          {facts.length > 0 && (
            <dl className={styles.facts}>
              {facts.map((fact) => <div key={fact.key}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
            </dl>
          )}
          {actions && <div className={styles.overviewActions}>{actions}</div>}
        </div>
      </footer>
      {details && <div className={styles.overviewDetails}>{details}</div>}
    </section>
  );
}

/** Where the exam window stands now: a timeline from start to end with the live countdown. */
function ScheduleBar({ schedule }: { schedule: ExamOverviewSchedule }) {
  const { t } = useTranslation("contest");
  const now = () => Date.now() + (schedule.serverTimeOffsetMs ?? 0);
  const [nowMs, setNowMs] = useState(now);
  const startMs = Date.parse(schedule.startTime);
  const endMs = Date.parse(schedule.endTime);
  const ended = nowMs >= endMs;
  useInterval(() => setNowMs(now()), ended ? null : 1000);

  const span = endMs - startMs;
  const percent = span > 0 ? Math.min(100, Math.max(0, ((nowMs - startMs) / span) * 100)) : 0;
  const status = nowMs < startMs
    ? t("workspace.overview.startsIn", `距離開始 ${formatCountdown(startMs - nowMs)}`, { time: formatCountdown(startMs - nowMs) })
    : ended
      ? t("workspace.overview.ended", "已結束")
      : t("workspace.overview.remaining", `剩餘 ${formatCountdown(endMs - nowMs)}`, { time: formatCountdown(endMs - nowMs) });

  return (
    <div className={styles.schedule}>
      <div className={styles.scheduleHead}>
        <span className={styles.scheduleStatus}>{status}</span>
        <span>{t("workspace.overview.duration", "作答時長")} {schedule.duration}</span>
      </div>
      <div
        className={styles.scheduleTrack}
        data-running={nowMs >= startMs && !ended}
        role="progressbar"
        aria-label={t("workspace.overview.timeProgress", "考試時間進度")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-valuetext={status}
        style={{ "--schedule-now": `${percent}%` } as CSSProperties}
      >
        <span className={styles.scheduleFill} style={{ width: `${percent}%` }} />
      </div>
      <div className={styles.scheduleEnds}>
        <span>{t("workspace.overview.start", "開始時間")} {formatExamTime(schedule.startTime)}</span>
        <span>{t("workspace.overview.end", "截止時間")} {formatExamTime(schedule.endTime)}</span>
      </div>
    </div>
  );
}

/** Answering progress as a ring, so it never reads as a second timeline. */
function ProgressRing({ progress }: { progress: ExamOverviewProgress }) {
  const { t } = useTranslation("contest");
  const ratio = progress.total > 0 ? progress.done / progress.total : 0;
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className={styles.progress}>
      <svg
        className={styles.progressRing}
        viewBox="0 0 36 36"
        role="img"
        aria-label={`${progress.label} ${Math.round(ratio * 100)}%`}
      >
        <circle cx="18" cy="18" r={radius} className={styles.progressRingTrack} />
        <circle
          cx="18"
          cy="18"
          r={radius}
          className={styles.progressRingValue}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
        />
      </svg>
      <div>
        <div className={styles.progressLabel}>{progress.label}</div>
        <div className={styles.progressValue}>
          {t("workspace.overview.itemProgress", `${progress.done} / ${progress.total} 題`, { done: progress.done, total: progress.total })}
        </div>
      </div>
    </div>
  );
}

/** The score written in red pen and ruled off twice, the way a graded paper comes back. */
function GradeMark({ grade }: { grade: ExamOverviewGrade }) {
  return (
    <div className={styles.grade} role="img" aria-label={`${grade.label} ${grade.score} / ${grade.max}`}>
      <span className={styles.gradeFigure} aria-hidden="true">
        <span className={styles.gradeScore}>{grade.score}</span>
        <span className={styles.gradeMax}>/{grade.max}</span>
      </span>
      {/* Two slightly uneven strokes that stretch with the number, so long totals never overflow. */}
      <svg className={styles.gradeRule} viewBox="0 0 200 18" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path pathLength={1} d="M3 6C58 3 132 4 197 2" />
        <path pathLength={1} d="M9 14C70 11 138 12 193 9" />
      </svg>
    </div>
  );
}
