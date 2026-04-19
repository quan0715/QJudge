import React, { useState } from "react";
import { Settings, UserMultiple } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { Modal } from "@carbon/react";
import type { ClassroomDetail } from "@/core/entities/classroom.entity";
import { SettingsModal, type SettingsModalNavItem } from "@/shared/ui/modal";
import { ClassroomSettingsGeneralPanel } from "./ClassroomSettingsGeneralPanel";
import { ClassroomSettingsMembersPanel } from "./ClassroomSettingsMembersPanel";
import { AddMembersModal } from "./AddMembersModal";

interface ClassroomSettingsModalProps {
  open: boolean;
  onClose: () => void;
  classroom: ClassroomDetail;
  onRefresh: () => Promise<void>;
  onDeleteClassroom: () => Promise<void>;
}

export const ClassroomSettingsModal: React.FC<ClassroomSettingsModalProps> = ({
  open,
  onClose,
  classroom,
  onRefresh,
  onDeleteClassroom,
}) => {
  const { t } = useTranslation("classroom");
  const { t: tc } = useTranslation("common");
  // Rendered as a sibling of SettingsModal (not inside it) to avoid nested
  // Carbon focus-trap conflicts that prevent typing in the inner modal.
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deletingClassroom, setDeletingClassroom] = useState(false);

  const navItems: SettingsModalNavItem[] = [
    {
      id: "general",
      label: t("sideMenu.settings", "教室設定"),
      icon: Settings,
    },
    {
      id: "members",
      label: t("settingsMembers", "助教管理"),
      icon: UserMultiple,
    },
  ];

  const renderPanel = (activeId: string) => {
    switch (activeId) {
      case "general":
        return (
          <ClassroomSettingsGeneralPanel
            classroom={classroom}
            onRefresh={onRefresh}
            onOpenDeleteConfirm={() => setConfirmDeleteOpen(true)}
          />
        );
      case "members":
        return (
          <ClassroomSettingsMembersPanel
            classroom={classroom}
            onRefresh={onRefresh}
            onOpenAddMembers={() => setAddMembersOpen(true)}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      <SettingsModal
        open={open}
        onRequestClose={onClose}
        modalHeading={t("sideMenu.settings", "教室設定")}
        navItems={navItems}
        renderPanel={renderPanel}
      />
      {/* Rendered outside SettingsModal to prevent nested focus-trap conflicts */}
      <AddMembersModal
        open={addMembersOpen}
        classroomId={classroom.id}
        reservedUsernames={[
          classroom.ownerUsername,
          ...classroom.admins.map((admin) => admin.username),
        ]}
        onClose={() => setAddMembersOpen(false)}
        onAdded={() => void onRefresh()}
      />
      <Modal
        open={confirmDeleteOpen}
        data-testid="classroom-delete-confirm-modal"
        size="sm"
        danger
        modalHeading={t("confirmDeleteClassroomTitle", "確認刪除教室")}
        primaryButtonText={
          <span data-testid="classroom-delete-submit">{tc("button.delete")}</span>
        }
        secondaryButtonText={tc("button.cancel")}
        primaryButtonDisabled={deletingClassroom}
        onRequestClose={() => setConfirmDeleteOpen(false)}
        onRequestSubmit={() => {
          setConfirmDeleteOpen(false);
          setDeletingClassroom(true);
          void onDeleteClassroom().finally(() => setDeletingClassroom(false));
        }}
      >
        <div data-testid="classroom-delete-confirm-marker">
          <p>{t("confirmDeleteClassroomBody", "確定要刪除此教室？此操作無法復原。")}</p>
          <p><strong>{classroom.name}</strong></p>
        </div>
      </Modal>
    </>
  );
};
