import React from "react";
import {
  Tile,
  Stack,
  CodeSnippet,
  InlineNotification,
  Tag,
  IconButton,
} from "@carbon/react";
import { Close, Time, DataBase } from "@carbon/icons-react";
import {
  SubmissionStatusBadge,
} from "@/shared/ui/tag/SubmissionStatusBadge";
import { TestResultDiff } from "./TestResultDiff";
import type { TestResult } from "@/core/entities/submission.entity";
import styles from "./TestResultDetail.module.scss";

export interface TestResultDetailProps {
  /** 測試結果資料 */
  result: TestResult;
  /** 測試案例編號（從 1 開始） */
  index: number;
  /** 顯示模式 */
  variant?: "panel" | "modal" | "inline";
  /** 是否顯示 Diff 比對 */
  showDiff?: boolean;
  /** 關閉事件（panel/modal 模式） */
  onClose?: () => void;
  /** 額外的 className */
  className?: string;
}

/**
 * 測試結果詳情元件
 * 顯示 Input / Output / Expected Output / Error / Diff
 */
export const TestResultDetail: React.FC<TestResultDetailProps> = ({
  result,
  index,
  variant = "panel",
  showDiff = true,
  onClose,
  className,
}) => {
  const {
    status,
    execTime,
    memoryUsage,
    isHidden,
    input,
    output,
    expectedOutput,
    errorMessage,
  } = result;

  const hasError = errorMessage && ["RE", "CE", "SE", "KR", "failed"].includes(status);
  // 只有 WA 或 failed 才顯示 Diff，TLE/RE/CE/MLE/SE 等狀態不需要比對
  // 需要同時滿足：有輸出、有預期輸出、兩者不同
  const hasDiff =
    showDiff &&
    (status === "WA" || status === "failed") &&
    output !== undefined &&
    expectedOutput !== undefined &&
    output !== expectedOutput;

  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
  };

  const formatMemory = (kb: number) => {
    if (kb < 1024) return `${kb} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const containerClass = [
    styles.container,
    styles[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClass}>
      {/* Header */}
      <div className={styles.header}>
        <Stack orientation="horizontal" gap={4} className={styles.titleRow}>
          <h3 className={styles.title}>Test Case #{index}</h3>
          <SubmissionStatusBadge status={status} size="md" />
          {isHidden && (
            <Tag type="gray" size="sm">
              Hidden
            </Tag>
          )}
        </Stack>
        {onClose && (variant === "panel" || variant === "modal") && (
          <IconButton
            kind="ghost"
            size="sm"
            label="Close"
            onClick={onClose}
            className={styles.closeButton}
          >
            <Close size={20} />
          </IconButton>
        )}
      </div>

      {/* Stats */}
      <div className={styles.stats}>
        {execTime !== undefined && (
          <div className={styles.stat}>
            <Time size={16} />
            <span>{formatTime(execTime)}</span>
          </div>
        )}
        {memoryUsage !== undefined && (
          <div className={styles.stat}>
            <DataBase size={16} />
            <span>{formatMemory(memoryUsage)}</span>
          </div>
        )}
      </div>

      {/* Error Message */}
      {hasError && (
        <InlineNotification
          kind="error"
          title="Error"
          subtitle={errorMessage}
          lowContrast
          hideCloseButton
          className={styles.errorNotification}
        />
      )}

      {/* Content Sections */}
      <div className={styles.sections}>
        {/* Input */}
        {input !== undefined && !isHidden && (
          <Tile className={styles.section}>
            <h4 className={styles.sectionTitle}>Input</h4>
            <CodeSnippet
              type="multi"
              feedback="Copied!"
              className={styles.codeSnippet}
            >
              {input || "(empty)"}
            </CodeSnippet>
          </Tile>
        )}

        {/* Expected Output */}
        {expectedOutput !== undefined && !isHidden && (
          <Tile className={styles.section}>
            <h4 className={styles.sectionTitle}>Expected Output</h4>
            <CodeSnippet
              type="multi"
              feedback="Copied!"
              className={styles.codeSnippet}
            >
              {expectedOutput || "(empty)"}
            </CodeSnippet>
          </Tile>
        )}

        {/* Actual Output */}
        {output !== undefined && (
          <Tile className={styles.section}>
            <h4 className={styles.sectionTitle}>Your Output</h4>
            <CodeSnippet
              type="multi"
              feedback="Copied!"
              className={styles.codeSnippet}
            >
              {output || "(empty)"}
            </CodeSnippet>
          </Tile>
        )}

        {/* Hidden Test Case Notice */}
        {isHidden && (
          <Tile className={styles.section}>
            <div className={styles.hiddenNotice}>
              <span>🔒</span>
              <span>This is a hidden test case. Input and expected output are not visible.</span>
            </div>
          </Tile>
        )}

        {/* Diff */}
        {hasDiff && !isHidden && (
          <Tile className={styles.section}>
            <h4 className={styles.sectionTitle}>Diff Comparison</h4>
            <TestResultDiff
              actual={output || ""}
              expected={expectedOutput || ""}
            />
          </Tile>
        )}
      </div>
    </div>
  );
};

export default TestResultDetail;
