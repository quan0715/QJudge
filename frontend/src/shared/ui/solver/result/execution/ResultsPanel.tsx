import React, { useState, useEffect, useMemo } from "react";
import { Layer, SkeletonText, SkeletonPlaceholder } from "@carbon/react";
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

// Labels for TestCaseSidebarList (used by EditTestCasesPanel)
export const TEST_CASE_SIDEBAR_LABELS = {
  list: "Test Cases",
  sample: "範例測資",
  custom: "自訂測資",
  emptyCustom: "尚無自訂測資",
  addAction: "新增測資",
  addNewLabel: "新增測資",
  addNewTag: "新增",
};

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

interface ResultsPanelProps {
  executionState: ExecutionState;
  testCases: TestCaseItem[];
}

export const ResultsPanel: React.FC<ResultsPanelProps> = ({
  executionState,
  testCases,
}) => {
  const [selectedResult, setSelectedResult] = useState<TestResult | null>(null);

  const { status, type, result, error: globalError } = executionState;
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

  // Reset selection on new run
  useEffect(() => {
    if (isPending) {
      setSelectedResult(null);
    }
  }, [isPending]);

  // Auto-select first result when results are available
  useEffect(() => {
    if (testResults.length > 0 && !selectedResult && !isPending) {
      setSelectedResult(testResults[0]);
    }
  }, [testResults, selectedResult, isPending]);

  const header = getHeaderInfo(isPending, globalError, result);

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

  // Map status for icon display
  const getIconStatus = (status: string) => {
    if (status === "AC" || status === "passed") return "passed";
    if (status === "pending" || status === "judging") return "pending";
    if (status === "info") return "passed"; // Custom test case executed
    return "failed";
  };

  // Skeleton for sidebar items
  const renderSidebarSkeleton = () => (
    <div className={styles.sidebarList}>
      {Array.from({ length: 3 }).map((_, idx) => (
        <div key={idx} className={styles.resultItem}>
          <SkeletonPlaceholder className={styles.skeletonStatusIcon} />
          <SkeletonText width="40px" />
          <SkeletonText width="30px" className={styles.skeletonMeta} />
        </div>
      ))}
    </div>
  );

  // Skeleton for detail panel
  const renderDetailSkeleton = () => (
    <div className={styles.detailSkeleton}>
      {/* Header skeleton */}
      <div className={styles.detailSkeletonHeader}>
        <SkeletonPlaceholder className={styles.skeletonIcon} />
        <SkeletonText heading width="150px" />
        <SkeletonPlaceholder className={styles.skeletonTag} />
      </div>
      {/* Stats skeleton */}
      <div className={styles.detailSkeletonStats}>
        <SkeletonText width="80px" />
        <SkeletonText width="80px" />
      </div>
      {/* Content sections skeleton */}
      <div className={styles.detailSkeletonSections}>
        <div className={styles.detailSkeletonSection}>
          <SkeletonText width="60px" />
          <SkeletonPlaceholder className={styles.skeletonCodeBlock} />
        </div>
        <div className={styles.detailSkeletonSection}>
          <SkeletonText width="100px" />
          <SkeletonPlaceholder className={styles.skeletonCodeBlock} />
        </div>
        <div className={styles.detailSkeletonSection}>
          <SkeletonText width="80px" />
          <SkeletonPlaceholder className={styles.skeletonCodeBlock} />
        </div>
      </div>
    </div>
  );

  return (
    <Layer level={0} className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <TestResultHeader
          header={header}
          isPending={isPending}
        />
      </div>

      {/* Content - IDE Terminal Style: Sidebar (Left) + Detail (Right) */}
      <div className={styles.content}>
        {/* Test Result List - Vertical Sidebar (Left) - Fixed width */}
        <div className={styles.sidebar}>
          {isPending && testResults.length === 0 ? (
            renderSidebarSkeleton()
          ) : (
            <div className={styles.sidebarList}>
              {testResults.map((result, idx) => {
                const isActive = selectedResult?.id === result.id;
                const formatTime = (ms: number) => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
                const iconStatus = getIconStatus(result.status);
                
                return (
                  <div
                    key={result.id ?? idx}
                    onClick={() => setSelectedResult(result)}
                    className={`${styles.resultItem} ${isActive ? styles["resultItem--active"] : ""}`}
                  >
                    <SubmissionStatusIcon status={iconStatus} size={16} />
                    <span className={styles.resultLabel}>#{idx + 1}</span>
                    <span className={styles.resultMeta}>
                      {result.status !== "pending" && result.execTime !== undefined && result.execTime > 0 && formatTime(result.execTime)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Test Result Detail (Right) - Fixed flex */}
        <div className={styles.detail}>
          {isPending && !selectedResult ? (
            renderDetailSkeleton()
          ) : selectedResult ? (
            <TestResultDetail
              result={selectedResult}
              index={selectedIndex}
              variant="inline"
              showDiff
            />
          ) : (
            <div className={styles.detailEmpty}>
              點擊左側測試案例查看詳情
            </div>
          )}
        </div>
      </div>
    </Layer>
  );
};

export default ResultsPanel;
