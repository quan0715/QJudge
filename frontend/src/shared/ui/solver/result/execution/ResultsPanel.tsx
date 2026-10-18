import React, { useState, useEffect, useMemo, useRef } from "react";
import { Button, Layer } from "@carbon/react";
import { Information } from "@carbon/icons-react";
import type { TestCaseItem } from "@/core/entities/testcase.entity";
import type { ExecutionState } from "@/core/types/solver.types";
import type { TestResult } from "@/core/entities/submission.entity";
import {
  buildCaseResults,
  getHeaderInfo,
  type CaseResultDisplay,
} from "./utils";
import { TestResultDetail } from "@/shared/ui/submission";
import { SubmissionStatusIcon } from "@/shared/ui/tag/SubmissionStatusBadge";
import { TestResultHeader } from "./TestResultHeader";
import styles from "./ResultsPanel.module.scss";

/**
 * 將 CaseResultDisplay 轉換為 TestResult
 * 使用 originalStatus 保留實際的 API 狀態（如 WA, TLE, AC 等）
 */
const toTestResult = (c: CaseResultDisplay, _idx: number): TestResult => ({
  id: c.id,
  testCaseId: c.id,
  // 使用 originalStatus 以便 TestResultDetail 能正確顯示 diff 和錯誤訊息
  status: c.originalStatus || (c.status === "passed" ? "AC" : c.status === "failed" ? "WA" : "pending"),
  execTime: c.executionTime || 0,
  memoryUsage: c.memoryUsage || 0,
  isHidden: c.isHidden || false,
  input: c.input,
  output: c.actualOutput,
  expectedOutput: c.expectedOutput,
  errorMessage: c.error,
});

const formatTime = (ms: number) => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;

interface ResultsPanelProps {
  executionState: ExecutionState;
  testCases: TestCaseItem[];
}

export const ResultsPanel: React.FC<ResultsPanelProps> = ({
  executionState,
  testCases,
}) => {
  const [selectedResult, setSelectedResult] = useState<TestResult | null>(null);
  const [expanded, setExpanded] = useState(false);
  const itemRefs = useRef(new Map<TestResult["id"], HTMLElement>());

  const { status, type, result, queued, startedAt } = executionState;
  const isPending = status === "running" || status === "polling";
  const isIdle = status === "idle";

  // Build case results and convert to TestResult[]
  const caseResults = useMemo(() =>
    buildCaseResults(isPending, type, result, testCases),
    [isPending, type, result, testCases]
  );

  const testResults = useMemo(() =>
    caseResults.map((c, idx) => toTestResult(c, idx)),
    [caseResults]
  );

  // Once results arrive, open the first failed case (or the first case).
  useEffect(() => {
    if (testResults.length === 0 || selectedResult || isPending) return;
    const target = testResults[Math.max(0, caseResults.findIndex((c) => c.status === "failed"))];
    setSelectedResult(target);
    itemRefs.current.get(target.id)?.scrollIntoView?.({ block: "nearest" });
  }, [caseResults, testResults, selectedResult, isPending]);

  const header = getHeaderInfo(executionState);

  // Show empty state when idle (no results yet)
  if (isIdle && !result) {
    return (
      <div className={styles.emptyState}>
        <Information size={48} className={styles.emptyStateIcon} />
        <p className={styles.emptyStateTitle}>尚無測試結果</p>
        <p className={styles.emptyStateSubtitle}>
          點擊「測試」按鈕執行測試，結果將顯示在此處
        </p>
      </div>
    );
  }

  const selectedIndex = selectedResult
    ? testResults.findIndex(r => r.id === selectedResult.id) + 1
    : 1;

  const waiting = (
    <div className={styles.waiting}>
      <p className={styles.waitingTitle}>
        {type === "submit" ? (queued ? "這筆提交正在排隊" : "這筆提交正在判題") : "測試執行中"}
      </p>
      {type === "submit" && <p className={styles.waitingHint}>可以先切到其他題，判完會通知你。</p>}
    </div>
  );
  const allAccepted = !isPending && result?.type === "submit" && result.status === "AC";

  const renderContent = () => {
    // Submissions report no per-case progress while judging.
    if (isPending && type === "submit") return waiting;
    if (allAccepted && !expanded) {
      return (
        <div className={styles.collapsed}>
          <span>{`${result.total || testResults.length} 筆測資全部通過。`}</span>
          <Button kind="ghost" size="sm" onClick={() => setExpanded(true)}>展開清單</Button>
        </div>
      );
    }
    return (
      <div className={styles.content}>
        {/* Test Result List - Vertical Sidebar (Left) - Fixed width */}
        <div className={styles.sidebar}>
          <div className={styles.sidebarList}>
            {testResults.map((item, idx) => {
              const isActive = selectedResult?.id === item.id;
              const time = item.status !== "pending" && item.execTime > 0 ? formatTime(item.execTime) : "";
              return (
                <Button
                  type="button"
                  kind="ghost"
                  size="sm"
                  key={item.id ?? idx}
                  ref={(element: HTMLButtonElement | null) => {
                    if (element) itemRefs.current.set(item.id, element);
                    else itemRefs.current.delete(item.id);
                  }}
                  onClick={() => setSelectedResult(item)}
                  aria-pressed={isActive}
                  aria-label={[`#${idx + 1}`, item.status, time].filter(Boolean).join(" ")}
                  className={`${styles.resultItem} ${isActive ? styles["resultItem--active"] : ""}`}
                >
                  <SubmissionStatusIcon status={item.status} size={16} />
                  <span className={styles.resultLabel}>#{idx + 1}</span>
                  <span className={styles.resultMeta}>{time}</span>
                </Button>
              );
            })}
          </div>
        </div>

        {/* Test Result Detail (Right) - Fixed flex */}
        <div className={styles.detail}>
          {selectedResult ? (
            <TestResultDetail
              result={selectedResult}
              index={selectedIndex}
              variant="inline"
              showDiff
            />
          ) : isPending ? (
            waiting
          ) : (
            <div className={styles.detailEmpty}>
              點擊左側測試案例查看詳情
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Layer level={0} className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <TestResultHeader
          header={header}
          isPending={isPending}
          startedAt={startedAt}
        />
      </div>

      {renderContent()}
    </Layer>
  );
};

export default ResultsPanel;
