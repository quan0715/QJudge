import React from "react";
import { Button } from "@carbon/react";
import { Archive, TrashCan } from "@carbon/icons-react";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";

interface ExamDangerZoneSectionProps {
  contestName: string;
  onArchive: () => Promise<void>;
  onDelete: () => Promise<void>;
  registerRef: (el: HTMLElement | null) => void;
}

const ExamDangerZoneSection: React.FC<ExamDangerZoneSectionProps> = ({
  contestName,
  onArchive,
  onDelete,
  registerRef,
}) => {
  const { confirm, modalProps } = useConfirmModal();

  const handleArchive = async () => {
    const accepted = await confirm({
      title: `確定要封存「${contestName}」？`,
      message: "封存後競賽將不再顯示於列表中，但資料不會被刪除。",
      confirmLabel: "封存",
      cancelLabel: "取消",
    });
    if (accepted) {
      await onArchive();
    }
  };

  const handleDelete = async () => {
    const accepted = await confirm({
      title: `確定要刪除「${contestName}」？`,
      message: "此操作無法還原，所有競賽資料（含題目、提交紀錄、排名等）將被永久刪除。",
      danger: true,
      confirmLabel: "永久刪除",
      cancelLabel: "取消",
    });
    if (accepted) {
      await onDelete();
    }
  };

  return (
    <section id="danger-zone" ref={registerRef}>
      <h3 style={{ fontSize: "var(--cds-heading-03-font-size)", fontWeight: 600, marginBottom: "0.5rem", color: "var(--cds-support-error)" }}>
        Danger Zone
      </h3>
      <p style={{ color: "var(--cds-text-secondary)", marginBottom: "1.5rem", fontSize: "0.875rem" }}>
        以下操作具有不可逆性，請謹慎操作。
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem", border: "1px solid var(--cds-border-subtle)", borderRadius: "4px" }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>封存競賽</div>
            <div style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
              封存後競賽將從列表隱藏，但資料保留。
            </div>
          </div>
          <Button kind="secondary" renderIcon={Archive} onClick={handleArchive}>
            封存
          </Button>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem", border: "1px solid var(--cds-support-error)", borderRadius: "4px" }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>刪除競賽</div>
            <div style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
              永久刪除此競賽及所有相關資料，此操作無法還原。
            </div>
          </div>
          <Button kind="danger" renderIcon={TrashCan} onClick={handleDelete}>
            刪除
          </Button>
        </div>
      </div>

      <ConfirmModal {...modalProps} />
    </section>
  );
};

export default ExamDangerZoneSection;
