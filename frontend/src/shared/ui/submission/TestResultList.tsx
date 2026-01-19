import React, { useState, useMemo } from "react";
import { ContentSwitcher, Switch } from "@carbon/react";
import { TestResultEntry, type TestResultEntryProps } from "./TestResultEntry";
import type { TestResult } from "@/core/entities/submission.entity";
import styles from "./TestResultList.module.scss";

export type TestResultListLayout = "horizontal" | "vertical" | "grid";
export type TestResultFilter = "all" | "failed";

export interface TestResultListProps {
  /** 測試結果陣列 */
  results: TestResult[];
  /** 佈局模式 */
  layout?: TestResultListLayout;
  /** 尺寸 */
  size?: TestResultEntryProps["size"];
  /** 選中的測試案例 ID */
  selectedId?: string | number;
  /** 點擊測試案例 */
  onSelect?: (result: TestResult) => void;
  /** Grid 模式每行數量（預設 4） */
  columns?: number;
  /** 是否顯示詳細資訊（時間/記憶體） */
  showDetails?: boolean;
  /** 額外 CSS class */
  className?: string;
  /** 是否顯示篩選器（預設當 results > 5 時顯示） */
  showFilter?: boolean;
  /** 預設篩選模式 */
  defaultFilter?: TestResultFilter;
}

// 判斷是否為 passed 狀態
const isPassed = (status: TestResult["status"]) => {
  return status === "AC" || status === "passed";
};

/**
 * 測試結果列表元件
 * 支援三種佈局：horizontal、vertical、grid
 * 支援篩選功能：All / Failed Only
 */
export const TestResultList: React.FC<TestResultListProps> = ({
  results,
  layout = "horizontal",
  size = "md",
  selectedId,
  onSelect,
  columns = 4,
  showDetails = true,
  className,
  showFilter,
  defaultFilter,
}) => {
  // 計算 failed 數量
  const failedCount = useMemo(
    () => results.filter((r) => !isPassed(r.status)).length,
    [results]
  );

  // 決定是否顯示篩選器：明確指定 or 當 results > 5 且有 failed
  const shouldShowFilter = showFilter ?? (results.length > 5 && failedCount > 0);

  // 決定預設篩選：有 failed 時預設顯示 failed only
  const initialFilter = defaultFilter ?? (failedCount > 0 ? "failed" : "all");
  const [filter, setFilter] = useState<TestResultFilter>(initialFilter);

  // 篩選後的結果（保留原始 index）
  const filteredResults = useMemo(() => {
    if (filter === "all") {
      return results.map((r, idx) => ({ result: r, originalIndex: idx }));
    }
    return results
      .map((r, idx) => ({ result: r, originalIndex: idx }))
      .filter(({ result }) => !isPassed(result.status));
  }, [results, filter]);

  const getLayoutClass = () => {
    switch (layout) {
      case "horizontal":
        return styles.horizontal;
      case "vertical":
        return styles.vertical;
      case "grid":
        return styles.grid;
      default:
        return styles.horizontal;
    }
  };

  const gridStyle =
    layout === "grid"
      ? ({ "--grid-columns": columns } as React.CSSProperties)
      : undefined;

  // Map status from TestResult to TestCaseStatus
  const mapStatus = (status: TestResult["status"]) => {
    if (status === "AC" || status === "passed") return "passed";
    if (status === "pending" || status === "judging") return "pending";
    return "failed";
  };

  return (
    <div className={`${styles.container} ${className || ""}`}>
      {/* Filter Switcher */}
      {shouldShowFilter && (
        <div className={styles.filterBar}>
          <ContentSwitcher
            size="sm"
            selectedIndex={filter === "all" ? 0 : 1}
            onChange={(e) => setFilter(e.index === 0 ? "all" : "failed")}
          >
            <Switch name="all" text={`All (${results.length})`} />
            <Switch name="failed" text={`Failed (${failedCount})`} />
          </ContentSwitcher>
        </div>
      )}

      {/* Results List */}
      <div
        className={`${styles.list} ${getLayoutClass()}`}
        style={gridStyle}
      >
        {filteredResults.length === 0 ? (
          <div className={styles.emptyState}>
            {filter === "failed" ? "All tests passed!" : "No test results"}
          </div>
        ) : (
          filteredResults.map(({ result, originalIndex }) => (
            <TestResultEntry
              key={result.id ?? originalIndex}
              index={originalIndex + 1}
              status={mapStatus(result.status)}
              execTime={result.execTime}
              memoryUsage={result.memoryUsage}
              isHidden={result.isHidden}
              size={size}
              isSelected={selectedId !== undefined && result.id === selectedId}
              onClick={onSelect ? () => onSelect(result) : undefined}
              showDetails={showDetails && layout !== "grid"}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default TestResultList;
