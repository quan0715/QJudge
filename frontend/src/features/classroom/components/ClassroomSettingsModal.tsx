import React, { useState } from "react";
import { Settings, UserMultiple } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
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
}

export const ClassroomSettingsModal: React.FC<ClassroomSettingsModalProps> = ({
  open,
  onClose,
  classroom,
  onRefresh,
}) => {
  const { t } = useTranslation("classroom");
  // Rendered as a sibling of SettingsModal (not inside it) to avoid nested
  // Carbon focus-trap conflicts that prevent typing in the inner modal.
  const [addMembersOpen, setAddMembersOpen] = useState(false);

  const navItems: SettingsModalNavItem[] = [
    {
      id: "general",
      label: t("tab.settings", "教室設定"),
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
        modalHeading={t("tab.settings", "教室設定")}
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
    </>
  );
};
