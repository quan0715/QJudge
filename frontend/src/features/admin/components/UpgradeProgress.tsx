import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, Copy } from "@carbon/icons-react";
import { Button, InlineNotification, ProgressIndicator, ProgressStep } from "@carbon/react";

import { useCopyText, useInterval } from "@/shared/hooks";
import { shortVersion, UPGRADE_STEPS, type UpgradeJob } from "@/core/entities/systemVersion.entity";
import { UPGRADE_STEP_LABELS } from "../domain/upgradeSteps";
import styles from "./UpgradeProgress.module.scss";

const formatElapsed = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const ElapsedTime = ({ startedAt }: { startedAt: string }) => {
  const { t } = useTranslation("admin");
  const [now, setNow] = useState(() => Date.now());
  useInterval(() => setNow(Date.now()), 1000);

  const started = Date.parse(startedAt);
  const seconds = Number.isFinite(started) ? Math.max(0, Math.floor((now - started) / 1000)) : 0;

  return (
    <span className={styles.elapsed}>
      {t("system.version.progress.elapsed", "經過時間 {{time}}", { time: formatElapsed(seconds) })}
    </span>
  );
};

const JobLog = ({ log }: { log: string }) => {
  const { t } = useTranslation("admin");
  const [open, setOpen] = useState(false);
  const { isCopied, copy } = useCopyText();
  const bodyId = useId();

  return (
    <div className={styles.log}>
      <div className={styles.logActions}>
        <Button
          kind="ghost"
          size="sm"
          renderIcon={open ? ChevronUp : ChevronDown}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((current) => !current)}
        >
          {t("system.version.log.toggle", "詳細紀錄")}
        </Button>
        <Button kind="ghost" size="sm" renderIcon={Copy} onClick={() => void copy(log)}>
          {isCopied
            ? t("system.version.log.copied", "已複製")
            : t("system.version.log.copy", "複製紀錄")}
        </Button>
      </div>
      {open ? (
        <pre id={bodyId} className={styles.logBody} tabIndex={0}>
          {log}
        </pre>
      ) : null}
    </div>
  );
};

interface UpgradeProgressProps {
  job: UpgradeJob;
  log: string;
  /** The API is out of reach because the services are being replaced, which is expected. */
  switching?: boolean;
}

/** The six upgrade steps, how long the job has run, and the host's log of it. */
const UpgradeProgress = ({ job, log, switching = false }: UpgradeProgressProps) => {
  const { t } = useTranslation("admin");

  const stepIndex = job.step ? UPGRADE_STEPS.indexOf(job.step) : -1;
  const stopped = job.status === "failed" || job.status === "interrupted";
  let currentIndex = Math.max(stepIndex, 0);
  if (job.status === "succeeded") currentIndex = UPGRADE_STEPS.length;
  else if (stopped) currentIndex = stepIndex;

  // Carbon words each step for assistive technology, so give it the page's language.
  const stepStatus = (id: string) => {
    switch (id) {
      case "carbon.progress-step.complete":
        return t("system.version.progress.status.complete", "已完成");
      case "carbon.progress-step.current":
        return t("system.version.progress.status.current", "進行中");
      case "carbon.progress-step.invalid":
        return job.status === "interrupted"
          ? t("system.version.progress.status.interrupted", "已中斷")
          : t("system.version.progress.status.failed", "發生錯誤");
      default:
        return t("system.version.progress.status.incomplete", "尚未開始");
    }
  };

  return (
    <div className={styles.progress}>
      <div className={styles.header}>
        <span className={styles.target}>
          {t("system.version.progress.target", "目標版本")}{" "}
          <code className={styles.targetSha}>{shortVersion(job.target)}</code>
        </span>
        {job.status === "running" ? <ElapsedTime startedAt={job.startedAt} /> : null}
      </div>

      {switching ? (
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          className={styles.notice}
          title={t(
            "system.version.switching",
            "正在切換服務，網站暫時無法連線。這是正常的，頁面會自動重新連線，不需要重新整理。",
          )}
        />
      ) : null}

      <ProgressIndicator vertical currentIndex={currentIndex}>
        {UPGRADE_STEPS.map((step, index) => (
          <ProgressStep
            key={step}
            label={t(`system.version.progress.steps.${step}`, UPGRADE_STEP_LABELS[step])}
            invalid={stopped && index === stepIndex}
            translateWithId={stepStatus}
          />
        ))}
      </ProgressIndicator>

      {log ? <JobLog log={log} /> : null}
    </div>
  );
};

export default UpgradeProgress;
