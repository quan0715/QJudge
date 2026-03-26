import React, { useState, useEffect, useRef, useMemo } from "react";
import { Modal } from "@carbon/react";
import { UserAvatar, Settings, Password, Catalog } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useSettingsDialog } from "@/features/auth/contexts/SettingsDialogContext";
import { ProfilePanel } from "@/features/auth/components/ProfilePanel";
import { PreferencesPanel } from "@/features/auth/components/PreferencesPanel";
import { APIKeyPanel } from "@/features/auth/components/APIKeyPanel";
import { PlansPanel } from "@/features/auth/components/PlansPanel";
import "./SettingsDialog.scss";

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: "profile", label: "個人檔案", icon: UserAvatar },
  { id: "preferences", label: "偏好設定", icon: Settings },
  { id: "apikey", label: "API Key", icon: Password, adminOnly: true },
  { id: "plans", label: "探索方案", icon: Catalog },
];

// Memoized panels to prevent re-renders from parent state changes
const MemoProfilePanel = React.memo(ProfilePanel);
const MemoPreferencesPanel = React.memo(PreferencesPanel);
const MemoAPIKeyPanel = React.memo(APIKeyPanel);
const MemoPlansPanel = React.memo(PlansPanel);

export const SettingsDialog: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isOpen, initialTab, close } = useSettingsDialog();
  const [activeId, setActiveId] = useState("profile");
  const contentRef = useRef<HTMLDivElement>(null);

  // Only derive role once — avoids re-render when user object reference changes
  const isTeacherOrAdmin = user?.role === "teacher" || user?.role === "admin";

  const visibleItems = useMemo(
    () => NAV_ITEMS.filter((item) => !item.adminOnly || isTeacherOrAdmin),
    [isTeacherOrAdmin]
  );

  useEffect(() => {
    if (isOpen) {
      const item = visibleItems[initialTab] ?? visibleItems[0];
      setActiveId(item.id);
      contentRef.current?.scrollTo(0, 0);
    }
  }, [isOpen, initialTab, visibleItems]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!user || !isOpen) return null;

  const handleNavClick = (id: string) => {
    setActiveId(id);
    const el = document.getElementById(`settings-section-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <Modal
      open
      onRequestClose={close}
      modalHeading={t("settings.title", "設定")}
      passiveModal
      size="lg"
      className="settings-dialog"
      preventCloseOnClickOutside
    >
      <div
        className="settings-dialog__layout"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Sidebar navigation (desktop) */}
        <nav className="settings-dialog__nav">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`settings-dialog__nav-item ${activeId === item.id ? "settings-dialog__nav-item--active" : ""}`}
                onClick={() => handleNavClick(item.id)}
              >
                <Icon size={16} />
                <span>{t(`settings.tabs.${item.id}`, item.label)}</span>
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div className="settings-dialog__content" ref={contentRef}>
          {/* Desktop: single active panel */}
          <div className="settings-dialog__desktop-content">
            <h2 className="settings-dialog__content-title">
              {t(
                `settings.tabs.${activeId}`,
                visibleItems.find((i) => i.id === activeId)?.label ?? ""
              )}
            </h2>
            {activeId === "profile" && <MemoProfilePanel />}
            {activeId === "preferences" && <MemoPreferencesPanel />}
            {activeId === "apikey" && isTeacherOrAdmin && <MemoAPIKeyPanel />}
            {activeId === "plans" && <MemoPlansPanel />}
          </div>

          {/* Mobile: profile + preferences only (no devices/plans/usage table) */}
          <div className="settings-dialog__mobile-content">
            <div id="settings-section-profile">
              <h2 className="settings-dialog__content-title">
                {t("settings.tabs.profile", "個人檔案")}
              </h2>
              <MemoProfilePanel hideDevices />
            </div>
            <div id="settings-section-preferences">
              <h2 className="settings-dialog__content-title">
                {t("settings.tabs.preferences", "偏好設定")}
              </h2>
              <MemoPreferencesPanel />
            </div>
            {isTeacherOrAdmin && (
              <div id="settings-section-apikey">
                <h2 className="settings-dialog__content-title">
                  {t("settings.tabs.apiKey", "API Key")}
                </h2>
                <MemoAPIKeyPanel hideUsageDetails />
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default SettingsDialog;
