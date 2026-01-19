import { useEffect, useMemo, useState } from "react";
import { Tag, InlineLoading } from "@carbon/react";
import { Time } from "@carbon/icons-react";
import type { ReactNode } from "react";

export type ContestTimerStatus = "upcoming" | "running" | "ended";

export interface ContestTimerProps {
  /** 目標時間（結束時間或開始時間） */
  targetTime: string | number | Date;
  /** 狀態：upcoming 顯示倒數開始；running 顯示倒數結束；ended 顯示已結束 */
  status: ContestTimerStatus;
  /** 文字標籤，如「距開始」或「距結束」 */
  label?: string;
  /** 時間用完時觸發 */
  onExpire?: () => void;
  /** 額外內容（右側自訂區塊） */
  extra?: ReactNode;
  className?: string;
}

const formatDuration = (ms: number): string => {
  if (ms <= 0) return "00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

export const ContestTimer = ({
  targetTime,
  status,
  label,
  onExpire,
  extra,
  className,
}: ContestTimerProps) => {
  const targetTs = useMemo(() => new Date(targetTime).getTime(), [targetTime]);
  const [now, setNow] = useState(() => Date.now());

  const remaining = Math.max(0, targetTs - now);
  const isExpired = status === "ended" || remaining <= 0;

  useEffect(() => {
    if (isExpired) {
      onExpire?.();
      return;
    }
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [isExpired, onExpire]);

  const statusTag =
    status === "running" ? (
      <Tag type="green" size="sm">
        進行中
      </Tag>
    ) : status === "upcoming" ? (
      <Tag type="blue" size="sm">
        即將開始
      </Tag>
    ) : (
      <Tag type="gray" size="sm">
        已結束
      </Tag>
    );

  return (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.75rem 1rem",
        borderRadius: "8px",
        backgroundColor: "var(--cds-layer-01)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <Time size={16} />
        <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
          <span style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
            {label || (status === "upcoming" ? "距開始" : "距結束")}
          </span>
          <strong style={{ fontSize: "1.25rem", letterSpacing: "0.5px" }}>
            {isExpired ? "00:00" : formatDuration(remaining)}
          </strong>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginLeft: "auto" }}>
        {status === "running" && !isExpired && <InlineLoading status="active" />}
        {statusTag}
        {extra}
      </div>
    </div>
  );
};

export default ContestTimer;
