import React, { useState } from "react";
import { Button, Modal, TextInput } from "@carbon/react";
import { TrashCan } from "@carbon/icons-react";
import { Section, ActionRow } from "@/shared/layout/SettingsPanel";
import styles from "./DangerZoneSection.module.scss";

export interface DangerZoneSectionProps {
  /** Current problem title (for delete confirmation) */
  problemTitle: string;
  /** Callback when delete is confirmed */
  onDelete: () => Promise<void>;
  /** Whether delete is in progress */
  deleteLoading?: boolean;
}

/**
 * DangerZoneSection - Dangerous operations section
 *
 * Contains delete button with title confirmation.
 */
export const DangerZoneSection: React.FC<DangerZoneSectionProps> = ({
  problemTitle,
  onDelete,
  deleteLoading = false,
}) => {
  // Delete confirmation modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Confirm delete
  const confirmDelete = async () => {
    if (deleteConfirmText !== problemTitle) return;
    try {
      await onDelete();
      setDeleteModalOpen(false);
    } catch {
      // Error handling is done by parent
    }
  };

  const canDelete = deleteConfirmText === problemTitle;

  return (
    <Section title="Danger Zone">
      <ActionRow
        label="刪除題目"
        description="刪除後將無法復原，所有相關的提交紀錄也將一併刪除"
      >
        <Button
          kind="danger--tertiary"
          size="sm"
          renderIcon={TrashCan}
          onClick={() => setDeleteModalOpen(true)}
          disabled={deleteLoading}
        >
          刪除題目
        </Button>
      </ActionRow>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteModalOpen}
        onRequestClose={() => {
          setDeleteModalOpen(false);
          setDeleteConfirmText("");
        }}
        onRequestSubmit={confirmDelete}
        modalHeading="確定要刪除此題目？"
        primaryButtonText="刪除"
        primaryButtonDisabled={!canDelete}
        secondaryButtonText="取消"
        danger
        size="sm"
        preventCloseOnClickOutside
      >
        <p className={styles.deleteWarning}>
          此操作無法復原。刪除後，所有相關的提交紀錄也將一併刪除。
        </p>
        <p className={styles.deleteInstruction}>
          請輸入題目名稱 <strong>{problemTitle}</strong> 以確認刪除：
        </p>
        <TextInput
          id="delete-confirm"
          labelText=""
          placeholder="輸入題目名稱..."
          value={deleteConfirmText}
          onChange={(e) => setDeleteConfirmText(e.target.value)}
          invalid={deleteConfirmText !== "" && !canDelete}
          invalidText="題目名稱不符"
        />
      </Modal>
    </Section>
  );
};

export default DangerZoneSection;
