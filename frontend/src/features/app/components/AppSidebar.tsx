import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { IconButton, Modal } from "@carbon/react";
import {
  ChevronDown,
  Book,
  RecentlyViewed,
  Settings,
  Logout,
  UserMultiple,
  Microscope,
  Bullhorn,
  DocumentBlank,
  Code,
  SidePanelClose,
  OpenPanelLeft,
} from "@carbon/icons-react";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useSettingsDialog } from "@/features/auth/contexts/SettingsDialogContext";
import { useTranslation } from "react-i18next";
import { useUserPreferences } from "@/features/auth/hooks/useUserPreferences";
import { Avatar } from "@/shared/ui/avatar";
import { SideMenu } from "./SideMenu";
import styles from "./AppSidebar.module.scss";

interface AppSidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function AppSidebar({ collapsed = false, onToggleCollapse }: AppSidebarProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { t } = useTranslation("common");
  const { avatarUrl, displayName } = useUserPreferences();
  const { open: openSettings } = useSettingsDialog();

  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const userAreaRef = useRef<HTMLDivElement>(null);

  // Close user menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handle = (e: MouseEvent) => {
      if (!userAreaRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [menuOpen]);

  const handleLogout = useCallback(async () => {
    await logout();
    navigate("/login");
  }, [logout, navigate]);

  const go = useCallback((path: string) => {
    setMenuOpen(false);
    navigate(path);
  }, [navigate]);

  const isTeacherOrAdmin = user?.role === "teacher" || user?.role === "admin";
  const isAdmin = user?.role === "admin";
  const name = displayName?.trim() || user?.username || user?.email || "User";

  return (
    <div className={styles.sidebar}>

      {/* ── Header: user trigger + collapse button ── */}
      <div className={styles.header}>
        <div className={styles.userArea} ref={userAreaRef}>
          {/* User dropdown panel */}
          {menuOpen && !collapsed && (
            <div className={styles.userPanel}>
              <div className={styles.userPanelHeader}>
                <Avatar name={name} url={avatarUrl || undefined} size="sm" />
                <div className={styles.userPanelInfo}>
                  <span className={styles.userPanelName}>{name}</span>
                  <span className={styles.userPanelRole}>
                    {t(`user.role.${user?.role ?? "student"}`)}
                  </span>
                </div>
              </div>
              <div className={styles.divider} />

              <button type="button" className={styles.menuItem} onClick={() => go("/docs")}>
                <Book size={16} /> {t("nav.documentation")}
              </button>
              <button type="button" className={styles.menuItem} onClick={() => go("/changelog")}>
                <RecentlyViewed size={16} /> {t("nav.changelog")}
              </button>
              <button
                type="button"
                className={styles.menuItem}
                onClick={() => { setMenuOpen(false); openSettings(); }}
              >
                <Settings size={16} /> {t("settings.title")}
              </button>

              {isTeacherOrAdmin && (
                <>
                  <div className={styles.divider} />
                  <button type="button" className={styles.menuItem} onClick={() => go("/drafts")}>
                    <DocumentBlank size={16} /> {t("header.draftProblems", "草稿題目")}
                  </button>
                </>
              )}

              {isAdmin && (
                <>
                  <div className={styles.divider} />
                  <button type="button" className={styles.menuItem} onClick={() => go("/system/users")}>
                    <UserMultiple size={16} /> {t("header.userManagement", "用戶管理")}
                  </button>
                  <button type="button" className={styles.menuItem} onClick={() => go("/admin/review-queue")}>
                    <Microscope size={16} /> {t("header.reviewQueue", "送審佇列")}
                  </button>
                  <button type="button" className={styles.menuItem} onClick={() => go("/management/announcements")}>
                    <Bullhorn size={16} /> {t("header.announcements", "公告管理")}
                  </button>
                </>
              )}

              {import.meta.env.DEV && (
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={() => { setMenuOpen(false); window.location.assign("/dev/storybook/"); }}
                >
                  <Code size={16} /> Storybook
                </button>
              )}

              <div className={styles.divider} />
              <button
                type="button"
                className={`${styles.menuItem} ${styles.menuItemDanger}`}
                onClick={() => { setMenuOpen(false); setLogoutModalOpen(true); }}
              >
                <Logout size={16} /> {t("button.logout")}
              </button>
            </div>
          )}

          {/* User trigger button */}
          <button
            type="button"
            className={`${styles.userTrigger} ${menuOpen ? styles.userTriggerActive : ""}`}
            onClick={() => setMenuOpen(v => !v)}
            aria-label={name}
          >
            <Avatar name={name} url={avatarUrl || undefined} size="sm" />
            <span className={styles.userTriggerName}>{name}</span>
            <ChevronDown
              size={14}
              className={`${styles.chevron} ${menuOpen ? styles.chevronOpen : ""}`}
            />
          </button>
        </div>

        {/* Collapse / expand button */}
        <IconButton
          kind="ghost"
          size="sm"
          label={collapsed ? t("ui.expandSidebar", "展開側欄") : t("ui.collapseSidebar", "收合側欄")}
          align="right"
          onClick={onToggleCollapse}
          className={styles.collapseBtn}
        >
          {collapsed ? <OpenPanelLeft size={16} /> : <SidePanelClose size={16} />}
        </IconButton>
      </div>

      {/* ── Navigation ── */}
      <div className={styles.nav}>
        <SideMenu variant="panel" />
      </div>

      <Modal
        open={logoutModalOpen}
        danger
        modalHeading={t("auth.logout.confirmTitle")}
        primaryButtonText={t("auth.logout.confirmButton")}
        secondaryButtonText={t("common:button.cancel")}
        onRequestClose={() => setLogoutModalOpen(false)}
        onRequestSubmit={handleLogout}
      >
        <p>{t("auth.logout.confirmMessage")}</p>
      </Modal>
    </div>
  );
}
