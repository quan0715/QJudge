import React, { useState } from "react";
import { Button, Toggle, Modal, TextInput } from "@carbon/react";
import { TrashCan, ViewOff, View } from "@carbon/icons-react";
import styles from "./DangerZoneSection.module.scss";

export interface DangerZoneSectionProps {
  /** Current problem title (for delete confirmation) */
  problemTitle: string;
  /** Current visibility state */
  isVisible: boolean;
  /** Callback when visibility changes */
  onVisibilityChange: (isVisible: boolean) => Promise<void>;
  /** Callback when delete is confirmed */
  onDelete: () => Promise<void>;
  /** Whether visibility change is in progress */
  visibilityLoading?: boolean;
  /** Whether delete is in progress */
  deleteLoading?: boolean;
}

/**
 * DangerZoneSection - Dangerous operations section
 *
 * Contains:
 * - Visibility toggle (with confirmation)
 * - Delete button (with title confirmation)
 */
export const DangerZoneSection: React.FC<DangerZoneSectionProps> = ({
  problemTitle,
  isVisible,
  onVisibilityChange,
  onDelete,
  visibilityLoading = false,
  deleteLoading = false,
}) => {
  // Visibility confirmation modal
  const [visibilityModalOpen, setVisibilityModalOpen] = useState(false);
  const [pendingVisibility, setPendingVisibility] = useState(isVisible);

  // Delete confirmation modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Handle visibility toggle request
  const handleVisibilityToggle = (newValue: boolean) => {
    setPendingVisibility(newValue);
    setVisibilityModalOpen(true);
  };

  // Confirm visibility change
  const confirmVisibilityChange = async () => {
    try {
      await onVisibilityChange(pendingVisibility);
      setVisibilityModalOpen(false);
    } catch (error) {
      // Error handling is done by parent
    }
  };

  // Confirm delete
  const confirmDelete = async () => {
    if (deleteConfirmText !== problemTitle) return;
    try {
      await onDelete();
      setDeleteModalOpen(false);
    } catch (error) {
      // Error handling is done by parent
    }
  };

  const canDelete = deleteConfirmText === problemTitle;

  return (
    <div className={styles.dangerZone}>
      <h3 className={styles.title}>Danger Zone</h3>

      {/* Visibility Toggle */}
      <div className={styles.item}>
        <div className={styles.itemInfo}>
          <div className={styles.itemIcon}>
            {isVisible ? <View size={20} /> : <ViewOff size={20} />}
          </div>
          <div className={styles.itemContent}>
            <h4 className={styles.itemTitle}>顯示狀態</h4>
            <p className={styles.itemDescription}>
              {isVisible
                ? "此題目目前為公開狀態，學生可以看到並作答"
                : "此題目目前為隱藏狀態，僅管理員和教師可見"}
            </p>
          </div>
        </div>
        <Toggle
          id="visibility-toggle"
          labelA="隱藏"
          labelB="公開"
          toggled={isVisible}
          onToggle={handleVisibilityToggle}
          disabled={visibilityLoading}
        />
      </div>

      {/* Delete Button */}
      <div className={styles.item}>
        <div className={styles.itemInfo}>
          <div className={`${styles.itemIcon} ${styles.danger}`}>
            <TrashCan size={20} />
          </div>
          <div className={styles.itemContent}>
            <h4 className={styles.itemTitle}>刪除題目</h4>
            <p className={styles.itemDescription}>
              刪除後將無法復原，所有相關的提交紀錄也將一併刪除
            </p>
          </div>
        </div>
        <Button
          kind="danger--tertiary"
          size="sm"
          renderIcon={TrashCan}
          onClick={() => setDeleteModalOpen(true)}
          disabled={deleteLoading}
        >
          刪除題目
        </Button>
      </div>

      {/* Visibility Confirmation Modal */}
      <Modal
        open={visibilityModalOpen}
        onRequestClose={() => setVisibilityModalOpen(false)}
        onRequestSubmit={confirmVisibilityChange}
        modalHeading={pendingVisibility ? "確定公開題目？" : "確定隱藏題目？"}
        primaryButtonText="確認"
        secondaryButtonText="取消"
        size="sm"
        preventCloseOnClickOutside
      >
        <p>
          {pendingVisibility
            ? "公開後，所有學生都可以看到此題目並進行作答。"
            : "隱藏後，此題目將只對管理員和教師可見，學生無法看到或作答。"}
        </p>
      </Modal>

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
    </div>
  );
};

export default DangerZoneSection;
