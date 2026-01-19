import React from "react";
import {
  Stack,
  CodeSnippet,
  TextArea,
  Button,
  Tag,
  IconButton,
} from "@carbon/react";
import { Locked, Copy, TrashCan, Close } from "@carbon/icons-react";
import type { TestCaseData } from "@/core/entities/testcase.entity";
import { isHiddenTestCase } from "@/core/entities/testcase.entity";
import styles from "./TestCaseDetail.module.scss";

export type TestCaseDetailMode = "readonly" | "writable" | "hidden";

export interface TestCaseDetailProps {
  /** 測試案例資料 */
  testCase: TestCaseData | null;
  /** 測試案例編號（從 1 開始） */
  index?: number;
  /** 顯示模式 */
  mode?: TestCaseDetailMode;
  /** 更新 Input */
  onInputChange?: (value: string) => void;
  /** 更新 Expected Output */
  onOutputChange?: (value: string) => void;
  /** 刪除測資（custom only） */
  onDelete?: () => void;
  /** 複製為自訂測資（sample only） */
  onDuplicate?: () => void;
  /** 關閉 */
  onClose?: () => void;
  /** 額外 CSS class */
  className?: string;
}

/**
 * 測試案例詳情元件
 * 支援 readonly / writable / hidden 三種模式
 */
export const TestCaseDetail: React.FC<TestCaseDetailProps> = ({
  testCase,
  index,
  mode = "readonly",
  onInputChange,
  onOutputChange,
  onDelete,
  onDuplicate,
  onClose,
  className,
}) => {
  // Empty state
  if (!testCase) {
    return (
      <div className={`${styles.container} ${styles.empty} ${className || ""}`}>
        <div className={styles.emptyContent}>
          <span>選擇測試案例以查看詳情</span>
        </div>
      </div>
    );
  }

  const { input, output, source } = testCase;
  const isWritable = mode === "writable";
  const isHiddenMode = mode === "hidden" || isHiddenTestCase(testCase);
  const isSample = source === "sample";
  const isCustom = source === "custom";

  const getTitle = () => {
    if (index) return `Test Case #${index}`;
    if (isSample) return "範例測資";
    if (isCustom) return "自訂測資";
    return "測試案例";
  };

  const getSourceTag = () => {
    if (isHiddenMode) return <Tag type="gray" size="sm" renderIcon={Locked}>隱藏</Tag>;
    if (isSample) return <Tag type="blue" size="sm">範例</Tag>;
    if (isCustom) return <Tag type="purple" size="sm">自訂</Tag>;
    return null;
  };

  return (
    <div className={`${styles.container} ${className || ""}`}>
      {/* Header */}
      <div className={styles.header}>
        <Stack orientation="horizontal" gap={3} className={styles.headerLeft}>
          <h4 className={styles.title}>{getTitle()}</h4>
          {getSourceTag()}
        </Stack>
        <Stack orientation="horizontal" gap={2} className={styles.headerActions}>
          {isSample && onDuplicate && !isHiddenMode && (
            <Button
              kind="ghost"
              size="sm"
              renderIcon={Copy}
              hasIconOnly
              iconDescription="複製為自訂測資"
              tooltipPosition="bottom"
              onClick={onDuplicate}
            />
          )}
          {isCustom && onDelete && (
            <Button
              kind="danger--ghost"
              size="sm"
              renderIcon={TrashCan}
              hasIconOnly
              iconDescription="刪除此測資"
              tooltipPosition="bottom"
              onClick={onDelete}
            />
          )}
          {onClose && (
            <IconButton
              kind="ghost"
              size="sm"
              label="關閉"
              onClick={onClose}
            >
              <Close />
            </IconButton>
          )}
        </Stack>
      </div>

      {/* Content */}
      {isHiddenMode ? (
        <div className={styles.hiddenContent}>
          <Locked size={32} />
          <span>此為隱藏測資，無法查看內容</span>
        </div>
      ) : (
        <Stack gap={5} className={styles.content}>
          {/* Input Section */}
          <div className={styles.section}>
            <label className={styles.sectionLabel}>Input</label>
            {isWritable ? (
              <TextArea
                id="testcase-input"
                labelText=""
                placeholder="輸入測試資料..."
                value={input || ""}
                onChange={(e) => onInputChange?.(e.target.value)}
                rows={6}
                className={styles.textarea}
              />
            ) : (
              <CodeSnippet type="multi" feedback="Copied" className={styles.codeSnippet}>
                {input || "(Empty)"}
              </CodeSnippet>
            )}
          </div>

          {/* Expected Output Section */}
          <div className={styles.section}>
            <label className={styles.sectionLabel}>Expected Output</label>
            {isWritable ? (
              <TextArea
                id="testcase-output"
                labelText=""
                placeholder="預期輸出..."
                value={output || ""}
                onChange={(e) => onOutputChange?.(e.target.value)}
                rows={6}
                className={styles.textarea}
              />
            ) : (
              <CodeSnippet type="multi" feedback="Copied" className={styles.codeSnippet}>
                {output || "(Empty)"}
              </CodeSnippet>
            )}
          </div>
        </Stack>
      )}
    </div>
  );
};

export default TestCaseDetail;
