import React from "react";
import { Stack, Tag } from "@carbon/react";
import { Locked, Edit, Copy } from "@carbon/icons-react";
import type { TestCaseSource } from "@/core/entities/testcase.entity";
import styles from "./TestCaseEntry.module.scss";

export interface TestCaseEntryProps {
  /** 測試案例編號（從 1 開始） */
  index: number;
  /** 來源類型 */
  source: TestCaseSource;
  /** 標籤（可選，覆蓋預設） */
  label?: string;
  /** 是否為隱藏測資 */
  isHidden?: boolean;
  /** 尺寸 */
  size?: "sm" | "md" | "lg";
  /** 點擊事件 */
  onClick?: () => void;
  /** 是否選中 */
  isSelected?: boolean;
  /** 是否可編輯（顯示編輯圖示） */
  editable?: boolean;
  /** 是否可複製（顯示複製圖示） */
  copyable?: boolean;
  /** Input 預覽（顯示前 N 個字元） */
  inputPreview?: string;
  /** 預覽字元數 */
  previewLength?: number;
}

const SIZE_CONFIG = {
  sm: { padding: "0.25rem 0.5rem", fontSize: "0.75rem", gap: 2 },
  md: { padding: "0.5rem 0.75rem", fontSize: "0.875rem", gap: 3 },
  lg: { padding: "0.75rem 1rem", fontSize: "1rem", gap: 4 },
};

const SOURCE_CONFIG: Record<TestCaseSource, { label: string; tagType: "blue" | "purple" | "gray" }> = {
  sample: { label: "範例", tagType: "blue" },
  custom: { label: "自訂", tagType: "purple" },
  hidden: { label: "隱藏", tagType: "gray" },
};

/**
 * 單一測試案例項目
 * 用於「自訂測資」或「查看範例測資」的場景
 */
export const TestCaseEntry: React.FC<TestCaseEntryProps> = ({
  index,
  source,
  label,
  isHidden = false,
  size = "md",
  onClick,
  isSelected = false,
  editable = false,
  copyable = false,
  inputPreview,
  previewLength = 30,
}) => {
  const config = SIZE_CONFIG[size];
  const sourceConfig = SOURCE_CONFIG[isHidden ? "hidden" : source];
  const isClickable = !!onClick;

  const displayLabel = label || `#${index}`;
  const truncatedPreview = inputPreview 
    ? inputPreview.length > previewLength 
      ? `${inputPreview.slice(0, previewLength)}...`
      : inputPreview
    : null;

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
        {/* Label */}
        <span className={styles.label}>{displayLabel}</span>

        {/* Source Tag */}
        <Tag type={sourceConfig.tagType} size="sm">
          {sourceConfig.label}
        </Tag>

        {/* Icons */}
        <div className={styles.icons}>
          {isHidden && <Locked size={14} className={styles.icon} />}
          {editable && source === "custom" && <Edit size={14} className={styles.icon} />}
          {copyable && source === "sample" && <Copy size={14} className={styles.icon} />}
        </div>
      </Stack>

      {/* Input Preview */}
      {truncatedPreview && (
        <div className={styles.preview}>
          <code>{truncatedPreview}</code>
        </div>
      )}
    </div>
  );
};

export default TestCaseEntry;
