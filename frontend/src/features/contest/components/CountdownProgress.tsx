import { useState, type ReactNode } from "react";
import { ProgressBar } from "@carbon/react";
import { TimeDisplay } from "@/shared/components/dashboard";
import { useInterval } from "@/shared/hooks/useInterval";
import { formatCompactDuration } from "@/features/contest/components/studentDashboard/studentDashboardState";
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
      return { label: "倒數計時", value: "未設定", percent: 0 };
    }
    if (phase === "before") {
      return {
        label: "距離開始",
        value: formatCompactDuration(startMs - nowMs),
        percent: 0,
      };
    }
    if (phase === "during") {
      const total = Math.max(1, endMs - startMs);
      const elapsed = nowMs - startMs;
      return {
        label: "剩餘時間",
        value: formatCompactDuration(endMs - nowMs),
        percent: Math.round(Math.max(0, Math.min(100, (elapsed / total) * 100))),
      };
    }
    return {
      label: afterPhase?.label ?? "考試狀態",
      value: afterPhase?.value ?? "考試已結束",
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
          label="時間進度"
          hideLabel
          size="small"
          value={display.percent}
          status={phase === "after" ? "finished" : "active"}
          className={`${styles.progressBar} ${
            phase === "during" ? styles.running : ""
          }`}
        />
      ) : null}
    </div>
  );
}
