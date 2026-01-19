import React, { useMemo } from "react";
import { Button } from "@carbon/react";
import { Add } from "@carbon/icons-react";
import { TestCaseEntry, type TestCaseEntryProps } from "./TestCaseEntry";
import type { TestCaseData } from "@/core/entities/testcase.entity";
import styles from "./TestCaseList.module.scss";

// Re-export for convenience
export type { TestCaseData } from "@/core/entities/testcase.entity";

export interface TestCaseListProps {
  /** 測試案例資料 */
  testCases: TestCaseData[];
  /** 選中的測試案例 ID */
  selectedId?: string;
  /** 選中測試案例 */
  onSelect?: (testCase: TestCaseData) => void;
  /** 新增測試案例 */
  onAdd?: () => void;
  /** 尺寸 */
  size?: TestCaseEntryProps["size"];
  /** 是否顯示 Input 預覽 */
  showPreview?: boolean;
  /** 是否可編輯（custom 顯示編輯圖示） */
  editable?: boolean;
  /** 是否可複製（sample 顯示複製圖示） */
  copyable?: boolean;
  /** 佈局模式 */
  layout?: "vertical" | "horizontal";
  /** 額外 CSS class */
  className?: string;
  /** 是否分組顯示（Sample / Custom） */
  grouped?: boolean;
}

/**
 * 測試案例列表元件
 * 用於「自訂測資」或「查看範例測資」的場景
 */
export const TestCaseList: React.FC<TestCaseListProps> = ({
  testCases,
  selectedId,
  onSelect,
  onAdd,
  size = "md",
  showPreview = false,
  editable = false,
  copyable = false,
  layout = "vertical",
  className,
  grouped = false,
}) => {
  // 分組：使用 source 判斷
  const { sampleCases, customCases } = useMemo(() => {
    const sample = testCases.filter((tc) => tc.source === "sample");
    const custom = testCases.filter((tc) => tc.source === "custom");
    return { sampleCases: sample, customCases: custom };
  }, [testCases]);

  const renderEntry = (tc: TestCaseData, index: number) => (
    <TestCaseEntry
      key={tc.id}
      index={index + 1}
      source={tc.source}
      isHidden={tc.isHidden}
      size={size}
      isSelected={selectedId === tc.id}
      onClick={onSelect ? () => onSelect(tc) : undefined}
      editable={editable}
      copyable={copyable}
      inputPreview={showPreview ? tc.input : undefined}
    />
  );

  const layoutClass = layout === "horizontal" ? styles.horizontal : styles.vertical;

  // Grouped view
  if (grouped) {
    return (
      <div className={`${styles.container} ${className || ""}`}>
        {/* Sample Cases */}
        {sampleCases.length > 0 && (
          <div className={styles.group}>
            <div className={styles.groupHeader}>範例測資</div>
            <div className={`${styles.list} ${layoutClass}`}>
              {sampleCases.map((tc, idx) => renderEntry(tc, idx))}
            </div>
          </div>
        )}

        {/* Custom Cases */}
        <div className={styles.group}>
          <div className={styles.groupHeader}>
            <span>自訂測資</span>
            {onAdd && (
              <Button
                kind="ghost"
                size="sm"
                renderIcon={Add}
                hasIconOnly
                iconDescription="新增測資"
                onClick={onAdd}
              />
            )}
          </div>
          <div className={`${styles.list} ${layoutClass}`}>
            {customCases.length === 0 ? (
              <div className={styles.empty}>尚無自訂測資</div>
            ) : (
              customCases.map((tc, idx) => renderEntry(tc, sampleCases.length + idx))
            )}
          </div>
        </div>
      </div>
    );
  }

  // Simple list view
  return (
    <div className={`${styles.container} ${className || ""}`}>
      {onAdd && (
        <div className={styles.addBar}>
          <Button kind="ghost" size="sm" renderIcon={Add} onClick={onAdd}>
            新增測資
          </Button>
        </div>
      )}
      <div className={`${styles.list} ${layoutClass}`}>
        {testCases.length === 0 ? (
          <div className={styles.empty}>尚無測試案例</div>
        ) : (
          testCases.map((tc, idx) => renderEntry(tc, idx))
        )}
      </div>
    </div>
  );
};

export default TestCaseList;
