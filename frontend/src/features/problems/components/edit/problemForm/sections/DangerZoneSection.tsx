import React, { useState } from "react";
import { Button, Dropdown, Modal, TextInput, InlineLoading } from "@carbon/react";
import { TrashCan, View, Password, ViewOff } from "@carbon/icons-react";
import type { ProblemVisibility } from "@/core/entities/problem.entity";
import styles from "./DangerZoneSection.module.scss";

export interface DangerZoneSectionProps {
  /** Current problem title (for delete confirmation) */
  problemTitle: string;
  /** Current visibility state */
  visibility: ProblemVisibility;
  /** Callback when visibility changes */
  onVisibilityChange: (visibility: ProblemVisibility) => Promise<void>;
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
 * - Visibility dropdown (with confirmation modal)
 * - Delete button (with title confirmation)
 */
export const DangerZoneSection: React.FC<DangerZoneSectionProps> = ({
  problemTitle,
  visibility,
  onVisibilityChange,
  onDelete,
  visibilityLoading = false,
  deleteLoading = false,
}) => {
  // Visibility confirmation modal
  const [visibilityModalOpen, setVisibilityModalOpen] = useState(false);
  const [pendingVisibility, setPendingVisibility] = useState<ProblemVisibility>(visibility);

  // Delete confirmation modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Visibility options
  const visibilityOptions = [
    { id: 'public', label: '公開 - 所有學生可在練習題庫看到' },
    { id: 'private', label: '私有 - 僅建立者和管理員可見' },
    { id: 'hidden', label: '隱藏 - 封存題目（不建議使用）' },
  ];

  // Get current visibility option
  const selectedVisibility = visibilityOptions.find(opt => opt.id === visibility);

  // Handle visibility dropdown change
  const handleVisibilityDropdownChange = ({ selectedItem }: { selectedItem: any }) => {
    if (selectedItem && selectedItem.id !== visibility) {
      setPendingVisibility(selectedItem.id as ProblemVisibility);
      setVisibilityModalOpen(true);
    }
  };

  // Confirm visibility change
  const confirmVisibilityChange = async () => {
    try {
      await onVisibilityChange(pendingVisibility);
      setVisibilityModalOpen(false);
    } catch {
      // Error handling is done by parent
    }
  };

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

  // Get icon for visibility
  const getVisibilityIcon = (vis: ProblemVisibility) => {
    switch (vis) {
      case 'public': return <View size={20} />;
      case 'private': return <Password size={20} />;
      case 'hidden': return <ViewOff size={20} />;
    }
  };

  // Get visibility description for confirmation modal
  const getVisibilityDescription = (vis: ProblemVisibility) => {
    switch (vis) {
      case 'public':
        return '公開後，所有學生都可以在練習題庫中看到此題目並進行作答。';
      case 'private':
        return '設為私有後，此題目將只對建立者和管理員可見，學生無法看到或作答。';
      case 'hidden':
        return '隱藏後，此題目將被封存。建議使用「私有」狀態而非「隱藏」。';
    }
  };

  // Get visibility modal heading
  const getVisibilityModalHeading = (vis: ProblemVisibility) => {
    switch (vis) {
      case 'public': return '確定要公開此題目？';
      case 'private': return '確定要設為私有？';
      case 'hidden': return '確定要隱藏此題目？';
    }
  };

  return (
    <div className={styles.dangerZone}>
      <h3 className={styles.title}>Danger Zone</h3>

      {/* Visibility Dropdown */}
      <div className={styles.item}>
        <div className={styles.itemInfo}>
          <div className={styles.itemIcon}>
            {getVisibilityIcon(visibility)}
          </div>
          <div className={styles.itemContent}>
            <h4 className={styles.itemTitle}>題目可見性</h4>
            <p className={styles.itemDescription}>
              控制誰可以看到這個題目
            </p>
          </div>
        </div>
        <div className={styles.visibilityControls}>
          {visibilityLoading ? (
            <InlineLoading description="更新中..." />
          ) : (
            <Dropdown
              id="visibility-dropdown"
              titleText=""
              label="選擇可見性"
              items={visibilityOptions}
              selectedItem={selectedVisibility}
              itemToString={(item) => (item ? item.label : '')}
              onChange={handleVisibilityDropdownChange}
              disabled={visibilityLoading}
            />
          )}
        </div>
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
        modalHeading={getVisibilityModalHeading(pendingVisibility)}
        primaryButtonText="確認變更"
        secondaryButtonText="取消"
        size="sm"
        preventCloseOnClickOutside
      >
        <p>{getVisibilityDescription(pendingVisibility)}</p>
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
