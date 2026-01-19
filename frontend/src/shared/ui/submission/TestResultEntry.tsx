import React from "react";
import { Stack } from "@carbon/react";
import { Locked } from "@carbon/icons-react";
import { SubmissionStatusIcon } from "@/shared/ui/tag/SubmissionStatusBadge";
import type { TestCaseStatus } from "@/core/entities/submission.entity";
import styles from "./TestResultEntry.module.scss";

export interface TestResultEntryProps {
  /** 測試案例編號（從 1 開始） */
  index: number;
  /** 狀態：passed | failed | pending */
  status: TestCaseStatus;
  /** 執行時間 (ms) */
  execTime?: number;
  /** 記憶體使用 (KB) */
  memoryUsage?: number;
  /** 是否為隱藏測資 */
  isHidden?: boolean;
  /** 尺寸 */
  size?: "sm" | "md" | "lg";
  /** 點擊事件 */
  onClick?: () => void;
  /** 是否選中 */
  isSelected?: boolean;
  /** 是否顯示詳細資訊（時間/記憶體） */
  showDetails?: boolean;
}

const SIZE_CONFIG = {
  sm: { icon: 14, padding: "0.25rem 0.5rem", fontSize: "0.75rem", gap: 2 },
  md: { icon: 16, padding: "0.5rem 0.75rem", fontSize: "0.875rem", gap: 3 },
  lg: { icon: 20, padding: "0.75rem 1rem", fontSize: "1rem", gap: 4 },
};

/**
 * 單一測試結果項目
 * 顯示狀態圖示、編號、執行時間/記憶體（可選）
 */
export const TestResultEntry: React.FC<TestResultEntryProps> = ({
  index,
  status,
  execTime,
  memoryUsage,
  isHidden = false,
  size = "md",
  onClick,
  isSelected = false,
  showDetails = true,
}) => {
  const config = SIZE_CONFIG[size];
  const isClickable = !!onClick;

  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatMemory = (kb: number) => {
    if (kb < 1024) return `${kb}KB`;
    return `${(kb / 1024).toFixed(1)}MB`;
  };

  return (
    <div
      className={`${styles.entry} ${isSelected ? styles.selected : ""} ${isClickable ? styles.clickable : ""}`}
      style={{
        padding: config.padding,
        fontSize: config.fontSize,
      }}
      onClick={onClick}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      <Stack orientation="horizontal" gap={config.gap} className={styles.content}>
        <SubmissionStatusIcon status={status} size={config.icon} />
        <span className={styles.label}>
          #{index}
          {isHidden && (
            <Locked size={config.icon - 2} className={styles.hiddenIcon} />
          )}
        </span>
        {showDetails && (execTime !== undefined || memoryUsage !== undefined) && (
          <span className={styles.details}>
            {execTime !== undefined && formatTime(execTime)}
            {execTime !== undefined && memoryUsage !== undefined && " / "}
            {memoryUsage !== undefined && formatMemory(memoryUsage)}
          </span>
        )}
      </Stack>
    </div>
  );
};

export default TestResultEntry;
