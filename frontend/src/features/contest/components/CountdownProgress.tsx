import { useState, type ReactNode } from "react";
import { ProgressBar } from "@carbon/react";
import { useTranslation } from "react-i18next";
import { TimeDisplay } from "@/shared/ui/dashboard";
import { useInterval } from "@/shared/hooks/useInterval";
import { formatContestCompactDuration } from "@/features/contest/utils/contestTimeFormat";
import styles from "./CountdownProgress.module.scss";

export interface CountdownProgressProps {
  startTime: string;
  endTime: string;
  /** Override the value shown when the contest is over. Default: "考試已結束". */
  afterPhase?: { label: string; value: ReactNode };
  /** Hide the progress bar (default: shown). */
  hideProgress?: boolean;
}

type Phase = "before" | "during" | "after" | "unset";

export function CountdownProgress({
  startTime,
  endTime,
  afterPhase,
  hideProgress = false,
}: CountdownProgressProps) {
  const { t } = useTranslation("contest");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const startMs = Date.parse(startTime);
  const endMs = Date.parse(endTime);

  const phase: Phase = !Number.isFinite(startMs) || !Number.isFinite(endMs)
    ? "unset"
    : nowMs < startMs
      ? "before"
      : nowMs >= endMs
        ? "after"
        : "during";

  useInterval(
    () => setNowMs(Date.now()),
    phase === "during" || phase === "before" ? 1000 : null,
  );

  const display = (() => {
    if (phase === "unset") {
      return { label: t("countdown.label", "倒數計時"), value: t("countdown.unset", "未設定"), percent: 0 };
    }
    if (phase === "before") {
      return {
        label: t("countdown.untilStart", "距離開始"),
        value: formatContestCompactDuration(startMs - nowMs),
        percent: 0,
      };
    }
    if (phase === "during") {
      const total = Math.max(1, endMs - startMs);
      const elapsed = nowMs - startMs;
      return {
        label: t("countdown.remaining", "剩餘時間"),
        value: formatContestCompactDuration(endMs - nowMs),
        percent: Math.round(Math.max(0, Math.min(100, (elapsed / total) * 100))),
      };
    }
    return {
      label: afterPhase?.label ?? t("countdown.examStatus", "考試狀態"),
      value: afterPhase?.value ?? t("countdown.ended", "考試已結束"),
      percent: 100,
    };
  })();

  return (
    <div className={styles.root}>
      <TimeDisplay
        variant="countdown"
        label={display.label}
        value={display.value}
      />
      {!hideProgress ? (
        <ProgressBar
          label={t("countdown.progress", "時間進度")}
          hideLabel
          size="small"
          value={display.percent}
          status={phase === "after" ? "finished" : "active"}
        />
      ) : null}
    </div>
  );
}
