import { Checkmark, InProgress, Warning } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { TaskShellProgress, TaskStatus } from "./types";
import styles from "./ProgressCard.module.scss";

interface ProgressCardProps {
  status: TaskStatus;
  progress: TaskShellProgress;
  /** 正在 polling 中會有 active 動畫 */
  running: boolean;
}

export function SecondaryProgressBar({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const done = total > 0 && completed >= total;
  return (
    <section className={styles.progressCard}>
      <div className={styles.header}>
        <div className={`${styles.status} ${done ? styles.status_done : styles.status_idle}`}>
          <span>{done ? "完成" : "同步中"}</span>
        </div>
        <div className={styles.count}>
          {completed}
          <span className={styles.countTotal}> / {total}</span>
        </div>
      </div>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${percent}%` }} />
      </div>
      <div className={styles.foot}>
        <span>&nbsp;</span>
        <span>{percent}%</span>
      </div>
    </section>
  );
}

export function ProgressCard({ status, progress, running }: ProgressCardProps) {
  const { t } = useTranslation("contest");

  const statusIconKind: "running" | "done" | "fail" | "idle" =
    status === "failed" ? "fail" :
    status === "completed" || status === "review" ? "done" :
    running ? "running" :
    "idle";

  const StatusIcon =
    statusIconKind === "fail" ? Warning :
    statusIconKind === "done" ? Checkmark :
    InProgress;

  const statusLabel =
    status === "failed" ? t("grading.progressFailed", "批改失敗") :
    status === "completed" ? t("grading.progressCompleted", "批改完成") :
    status === "review" ? t("grading.progressReview", "待審核") :
    status === "paused" ? t("grading.progressPaused", "已暫停") :
    running ? t("grading.progressRunning", "AI 批改中") :
    t("grading.progressIdle", "等待批改");

  const percent = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <section className={styles.progressCard}>
      <div className={styles.header}>
        <div className={`${styles.status} ${styles[`status_${statusIconKind}`]}`}>
          <StatusIcon size={16} className={statusIconKind === "running" ? styles.spin : undefined} />
          <span>{statusLabel}</span>
        </div>
        <div className={styles.count}>
          {progress.completed}
          <span className={styles.countTotal}> / {progress.total}</span>
        </div>
      </div>
      <div className={styles.track}>
        <div
          className={`${styles.fill} ${statusIconKind === "running" ? styles.fillActive : ""}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className={styles.foot}>
        <span>{t("grading.aiSuggestionsReady", "已產生建議")}</span>
        <span>{percent}%</span>
      </div>
    </section>
  );
}
