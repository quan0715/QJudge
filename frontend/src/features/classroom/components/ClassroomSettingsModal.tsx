import React from "react";
import { Settings, UserMultiple } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ClassroomDetail } from "@/core/entities/classroom.entity";
import { SettingsModal, type SettingsModalNavItem } from "@/shared/ui/modal";
import { ClassroomSettingsGeneralPanel } from "./ClassroomSettingsGeneralPanel";
import { ClassroomSettingsMembersPanel } from "./ClassroomSettingsMembersPanel";

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
  const { t } = useTranslation();

  const navItems: SettingsModalNavItem[] = [
    {
      id: "general",
      label: t("classroom.tab.settings", "教室設定"),
      icon: Settings,
    },
    {
      id: "members",
      label: t("classroom.settingsMembers", "助教管理"),
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
          />
        );
      default:
        return null;
    }
  };

  return (
    <SettingsModal
      open={open}
      onRequestClose={onClose}
      modalHeading={t("classroom.tab.settings", "教室設定")}
      navItems={navItems}
      renderPanel={renderPanel}
    />
  );
};
