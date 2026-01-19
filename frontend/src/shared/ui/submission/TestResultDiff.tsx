import React from "react";
import styles from "./TestResultDiff.module.scss";

export interface TestResultDiffProps {
  /** 實際輸出 */
  actual: string;
  /** 預期輸出 */
  expected: string;
  /** 最大顯示行數 */
  maxLines?: number;
  /** 顯示行號 */
  showLineNumbers?: boolean;
}

interface DiffLine {
  type: "same" | "added" | "removed" | "changed";
  lineNumber: number;
  actualContent?: string;
  expectedContent?: string;
}

/**
 * 簡單的 Diff 比對元件
 * 逐行比對 actual 與 expected
 */
export const TestResultDiff: React.FC<TestResultDiffProps> = ({
  actual,
  expected,
  maxLines = 100,
  showLineNumbers = true,
}) => {
  const actualLines = actual.split("\n");
  const expectedLines = expected.split("\n");
  const maxLength = Math.max(actualLines.length, expectedLines.length);

  const diffLines: DiffLine[] = [];
  const limit = Math.min(maxLength, maxLines);

  for (let i = 0; i < limit; i++) {
    const actualLine = actualLines[i];
    const expectedLine = expectedLines[i];

    if (actualLine === expectedLine) {
      diffLines.push({
        type: "same",
        lineNumber: i + 1,
        actualContent: actualLine,
        expectedContent: expectedLine,
      });
    } else if (actualLine === undefined) {
      // Missing in actual
      diffLines.push({
        type: "removed",
        lineNumber: i + 1,
        expectedContent: expectedLine,
      });
    } else if (expectedLine === undefined) {
      // Extra in actual
      diffLines.push({
        type: "added",
        lineNumber: i + 1,
        actualContent: actualLine,
      });
    } else {
      // Content differs
      diffLines.push({
        type: "changed",
        lineNumber: i + 1,
        actualContent: actualLine,
        expectedContent: expectedLine,
      });
    }
  }

  const isTruncated = maxLength > maxLines;

  return (
    <div className={styles.diffContainer}>
      <div className={styles.diffHeader}>
        <span className={styles.columnHeader}>Expected</span>
        <span className={styles.columnHeader}>Actual</span>
      </div>
      <div className={styles.diffContent}>
        {diffLines.map((line) => (
          <div
            key={line.lineNumber}
            className={`${styles.diffRow} ${styles[line.type]}`}
          >
            {showLineNumbers && (
              <span className={styles.lineNumber}>{line.lineNumber}</span>
            )}
            <span className={styles.expectedCell}>
              {line.type === "added" ? (
                <span className={styles.empty}>&nbsp;</span>
              ) : (
                renderContent(line.expectedContent)
              )}
            </span>
            <span className={styles.actualCell}>
              {line.type === "removed" ? (
                <span className={styles.empty}>&nbsp;</span>
              ) : (
                renderContent(line.actualContent)
              )}
            </span>
          </div>
        ))}
        {isTruncated && (
          <div className={styles.truncated}>
            ... {maxLength - maxLines} more lines truncated
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * 渲染內容，處理空白字元
 */
function renderContent(content?: string): React.ReactNode {
  if (content === undefined || content === "") {
    return <span className={styles.emptyLine}>(empty)</span>;
  }
  // 顯示空白字元
  const rendered = content
    .replace(/ /g, "·") // 空格
    .replace(/\t/g, "→   "); // Tab
  return <span>{rendered}</span>;
}

export default TestResultDiff;
