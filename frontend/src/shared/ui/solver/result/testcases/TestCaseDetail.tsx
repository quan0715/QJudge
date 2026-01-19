import React, { useState } from "react";
import {
  Button,
  CodeSnippet,
  Modal,
  TextArea,
  Tile,
} from "@carbon/react";
import { Copy, TrashCan, Locked } from "@carbon/icons-react";
import type { CaseResultDisplay } from "../execution/utils";
import styles from "./TestCaseDetail.module.scss";

interface TestCaseDetailProps {
  result?: CaseResultDisplay;
  // Edit mode props
  editable?: boolean;
  onUpdate?: (field: "input" | "expectedOutput", value: string) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  isCustomCase?: boolean;
}

export const TestCaseDetail: React.FC<TestCaseDetailProps> = ({
  result,
  editable = false,
  onUpdate,
  onDelete,
  onDuplicate,
  isCustomCase = false,
}) => {
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);

  const handleDuplicateConfirm = () => {
    onDuplicate?.();
    setIsDuplicateModalOpen(false);
  };

  // Empty state if no result
  if (!result) {
    return (
      <div className={styles.emptyState}>
        <div>Select a test case to view details</div>
      </div>
    );
  }

  // Determine if currently editable
  const canEdit = editable && isCustomCase;
  const showReadOnlyNotice = editable && !isCustomCase && result;

  // Get editor header title
  const getEditorTitle = () => {
    if (isCustomCase) return "編輯測資";
    return "檢視測資";
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h4 className={styles.headerTitle}>{getEditorTitle()}</h4>
        <div className={styles.headerActions}>
          {showReadOnlyNotice && onDuplicate && (
            <Button
              kind="ghost"
              renderIcon={Copy}
              onClick={() => setIsDuplicateModalOpen(true)}
              hasIconOnly
              iconDescription="複製為自訂"
              tooltipPosition="bottom"
            />
          )}
          {isCustomCase && onDelete && (
            <Button
              kind="danger--ghost"
              renderIcon={TrashCan}
              onClick={onDelete}
              hasIconOnly
              iconDescription="刪除此測資"
              tooltipPosition="bottom"
            />
          )}
        </div>
      </div>

      {/* Duplicate Confirmation Modal */}
      <Modal
        open={isDuplicateModalOpen}
        onRequestClose={() => setIsDuplicateModalOpen(false)}
        onRequestSubmit={handleDuplicateConfirm}
        modalHeading="複製為自訂測資"
        modalLabel="確認操作"
        primaryButtonText="確認複製"
        secondaryButtonText="取消"
        size="sm"
      >
        <p>
          確定要將此範例測資複製為自訂測資嗎？複製後您可以自由編輯內容。
        </p>
      </Modal>

      {/* Read-only notice for sample cases */}
      {showReadOnlyNotice && (
        <div className={styles.readOnlyNotice}>
          <Locked size={16} />
          <span>範例測資無法編輯，您可以複製為自訂測資後進行修改</span>
        </div>
      )}

      {/* Content Sections */}
      <div className={styles.sections}>
        {/* Input */}
        <Tile className={styles.section}>
          <h4 className={styles.sectionTitle}>Input</h4>
          {canEdit ? (
            <TextArea
              id="testcase-input"
              labelText=""
              placeholder="輸入測試資料..."
              value={result?.input ?? ""}
              onChange={(e) => onUpdate?.("input", e.target.value)}
              rows={6}
              className={styles.textArea}
            />
          ) : (
            <CodeSnippet
              type="multi"
              feedback="Copied!"
              className={styles.codeSnippet}
            >
              {result?.input || "(empty)"}
            </CodeSnippet>
          )}
        </Tile>

        {/* Expected Output */}
        <Tile className={styles.section}>
          <h4 className={styles.sectionTitle}>Expected Output</h4>
          {canEdit ? (
            <TextArea
              id="testcase-output"
              labelText=""
              placeholder="預期輸出..."
              value={result?.expectedOutput ?? ""}
              onChange={(e) => onUpdate?.("expectedOutput", e.target.value)}
              rows={6}
              className={styles.textArea}
            />
          ) : (
            <CodeSnippet
              type="multi"
              feedback="Copied!"
              className={styles.codeSnippet}
            >
              {result?.expectedOutput || "(empty)"}
            </CodeSnippet>
          )}
        </Tile>
      </div>
    </div>
  );
};

export default TestCaseDetail;
