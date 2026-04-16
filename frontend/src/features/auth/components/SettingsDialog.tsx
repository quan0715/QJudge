import React from "react";
import { UserAvatar, Settings, Catalog, Connect, Activity } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useSettingsDialog } from "@/features/auth/contexts/SettingsDialogContext";
import { SettingsModal, type SettingsModalNavItem } from "@/shared/ui/modal";
import { ProfilePanel } from "@/features/auth/components/ProfilePanel";
import { PreferencesPanel } from "@/features/auth/components/PreferencesPanel";
import { AIUsagePanel } from "@/features/auth/components/AIUsagePanel";
import { PlansPanel } from "@/features/auth/components/PlansPanel";
import { MCPSetupPanel } from "@/features/auth/components/settings/MCPSetupPanel";

const NAV_ITEM_DEFS: (Omit<SettingsModalNavItem, "label"> & { tKey: string; adminOnly?: boolean })[] = [
  { id: "profile",     tKey: "settings.tabs.profile",     icon: UserAvatar },
  { id: "preferences", tKey: "settings.tabs.preferences", icon: Settings },
  { id: "ai-usage",    tKey: "settings.tabs.aiUsage",     icon: Activity, adminOnly: true },
  { id: "mcp",         tKey: "settings.tabs.mcp",         icon: Connect, adminOnly: true },
  { id: "plans",       tKey: "settings.tabs.plans",       icon: Catalog },
];

// Memoized panels to prevent re-renders from parent state changes
const MemoProfilePanel = React.memo(ProfilePanel);
const MemoPreferencesPanel = React.memo(PreferencesPanel);
const MemoAIUsagePanel = React.memo(AIUsagePanel);
const MemoMCPSetupPanel = React.memo(MCPSetupPanel);
const MemoPlansPanel = React.memo(PlansPanel);

export const SettingsDialog: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isOpen, initialTab, close } = useSettingsDialog();

  const isTeacherOrAdmin = user?.role === "teacher" || user?.role === "admin";

  const navItems: SettingsModalNavItem[] = NAV_ITEM_DEFS.map((item) => ({
    ...item,
    label: t(item.tKey),
    hidden: item.adminOnly ? !isTeacherOrAdmin : false,
  }));

  const visibleItems = navItems.filter((item) => !item.hidden);
  const initialActiveId = visibleItems[initialTab]?.id ?? visibleItems[0]?.id;

  if (!user || !isOpen) return null;

  const renderPanel = (activeId: string) => {
    switch (activeId) {
      case "profile":
        return <MemoProfilePanel />;
      case "preferences":
        return <MemoPreferencesPanel />;
      case "ai-usage":
        return isTeacherOrAdmin ? <MemoAIUsagePanel /> : null;
      case "mcp":
        return isTeacherOrAdmin ? <MemoMCPSetupPanel /> : null;
      case "plans":
        return <MemoPlansPanel />;
      default:
        return null;
    }
  };

  const renderMobileContent = () => (
    <>
      <div id="settings-section-profile">
        <h2 className="settings-modal__content-title">
          {t("settings.tabs.profile", "個人檔案")}
        </h2>
        <MemoProfilePanel hideDevices />
      </div>
      <div id="settings-section-preferences">
        <h2 className="settings-modal__content-title">
          {t("settings.tabs.preferences", "偏好設定")}
        </h2>
        <MemoPreferencesPanel />
      </div>
      {isTeacherOrAdmin && (
        <div id="settings-section-ai-usage">
          <h2 className="settings-modal__content-title">
            {t("settings.tabs.aiUsage", "AI 使用量")}
          </h2>
          <MemoAIUsagePanel />
        </div>
      )}
      {isTeacherOrAdmin && (
        <div id="settings-section-mcp">
          <h2 className="settings-modal__content-title">
            {t("settings.tabs.mcp", "MCP 連線")}
          </h2>
          <MemoMCPSetupPanel />
        </div>
      )}
    </>
  );

  return (
    <SettingsModal
      open={isOpen}
      onRequestClose={close}
      modalHeading={t("settings.title", "設定")}
      navItems={navItems}
      initialActiveId={initialActiveId}
      renderPanel={renderPanel}
      renderMobileContent={renderMobileContent}
    />
  );
};

export default SettingsDialog;
