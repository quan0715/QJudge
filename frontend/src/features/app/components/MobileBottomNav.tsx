import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Modal } from "@carbon/react";
import {
  Education,
  Book,
  Chat as ChatIcon,
  Dashboard,
  Settings,
  Logout,
  RecentlyViewed,
  UserMultiple,
  Microscope,
  Bullhorn,
  DocumentBlank,
  Code,
} from "@carbon/icons-react";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useSettingsDialog } from "@/features/auth/contexts/SettingsDialogContext";
import { useTranslation } from "react-i18next";
import { useUserPreferences } from "@/features/auth/hooks/useUserPreferences";
import { Avatar } from "@/shared/ui/avatar";
import styles from "./MobileBottomNav.module.scss";

export function MobileBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { t } = useTranslation("common");
  const { avatarUrl, displayName } = useUserPreferences();
  const { open: openSettings } = useSettingsDialog();

  const [userSheetOpen, setUserSheetOpen] = useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const isTeacherOrAdmin = user?.role === "teacher" || user?.role === "admin";
  const isAdmin = user?.role === "admin";
  const name = displayName?.trim() || user?.username || user?.email || "User";

  // Close sheet on outside tap
  useEffect(() => {
    if (!userSheetOpen) return;
    const handle = (e: TouchEvent | MouseEvent) => {
      if (!sheetRef.current?.contains(e.target as Node)) setUserSheetOpen(false);
    };
    document.addEventListener("mousedown", handle);
    document.addEventListener("touchstart", handle);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("touchstart", handle);
    };
  }, [userSheetOpen]);

  const go = useCallback((path: string) => {
    setUserSheetOpen(false);
    navigate(path);
  }, [navigate]);

  const handleLogout = useCallback(async () => {
    await logout();
    navigate("/login");
  }, [logout, navigate]);

  const isActive = (prefix: string) => location.pathname.startsWith(prefix);

  const navItems = [
    { key: "dashboard", label: t("nav.dashboard"), Icon: Dashboard, path: "/dashboard", show: true },
    { key: "classrooms", label: t("nav.classrooms"), Icon: Education, path: "/classrooms", show: !isTeacherOrAdmin, matchPrefixes: ["/dashboard", "/classrooms"] },
    { key: "banks", label: t("nav.questionBanks"), Icon: Book, path: "/marketplace", show: isTeacherOrAdmin },
    { key: "chat", label: t("nav.chat"), Icon: ChatIcon, path: "/chat", show: isTeacherOrAdmin },
  ].filter(item => item.show);

  return (
    <>
      <nav className={styles.nav} aria-label={t("header.mainNavigation")}>
        {navItems.map(({ key, label, Icon, path }) => {
          const active = isActive(path) || (key === "dashboard" && (isActive("/dashboard") || (isTeacherOrAdmin && location.pathname === "/")));
          return (
            <button
              key={key}
              type="button"
              className={`${styles.tab} ${active ? styles.tabActive : ""}`}
              onClick={() => navigate(path)}
              aria-label={label}
            >
              <Icon size={22} />
              <span className={styles.tabLabel}>{label}</span>
            </button>
          );
        })}

        {/* User avatar tab */}
        <button
          type="button"
          className={`${styles.tab} ${userSheetOpen ? styles.tabActive : ""}`}
          onClick={() => setUserSheetOpen(v => !v)}
          aria-label={name}
        >
          <Avatar name={name} url={avatarUrl || undefined} size="sm" />
        </button>
      </nav>

      {/* User bottom sheet */}
      {userSheetOpen && (
        <div className={styles.sheet} ref={sheetRef}>
          <div className={styles.sheetHandle} />
          <div className={styles.sheetUserRow}>
            <Avatar name={name} url={avatarUrl || undefined} size="sm" />
            <div className={styles.sheetUserInfo}>
              <span className={styles.sheetUserName}>{name}</span>
              <span className={styles.sheetUserRole}>{t(`user.role.${user?.role ?? "student"}`)}</span>
            </div>
          </div>
          <div className={styles.sheetDivider} />

          <button type="button" className={styles.sheetItem} onClick={() => go("/docs")}>
            <RecentlyViewed size={18} /> {t("nav.documentation")}
          </button>
          <button type="button" className={styles.sheetItem} onClick={() => go("/changelog")}>
            <RecentlyViewed size={18} /> {t("nav.changelog")}
          </button>
          <button type="button" className={styles.sheetItem} onClick={() => { setUserSheetOpen(false); openSettings(); }}>
            <Settings size={18} /> {t("settings.title")}
          </button>

          {isTeacherOrAdmin && (
            <>
              <div className={styles.sheetDivider} />
              <button type="button" className={styles.sheetItem} onClick={() => go("/drafts")}>
                <DocumentBlank size={18} /> {t("header.draftProblems", "草稿題目")}
              </button>
            </>
          )}

          {isAdmin && (
            <>
              <div className={styles.sheetDivider} />
              <button type="button" className={styles.sheetItem} onClick={() => go("/system/users")}>
                <UserMultiple size={18} /> {t("header.userManagement", "用戶管理")}
              </button>
              <button type="button" className={styles.sheetItem} onClick={() => go("/admin/review-queue")}>
                <Microscope size={18} /> {t("header.reviewQueue", "送審佇列")}
              </button>
              <button type="button" className={styles.sheetItem} onClick={() => go("/management/announcements")}>
                <Bullhorn size={18} /> {t("header.announcements", "公告管理")}
              </button>
            </>
          )}

          {import.meta.env.DEV && (
            <button type="button" className={styles.sheetItem} onClick={() => { setUserSheetOpen(false); window.location.assign("/dev/storybook/"); }}>
              <Code size={18} /> Storybook
            </button>
          )}

          <div className={styles.sheetDivider} />
          <button
            type="button"
            className={`${styles.sheetItem} ${styles.sheetItemDanger}`}
            onClick={() => { setUserSheetOpen(false); setLogoutModalOpen(true); }}
          >
            <Logout size={18} /> {t("button.logout")}
          </button>
        </div>
      )}

      {userSheetOpen && <div className={styles.sheetBackdrop} onClick={() => setUserSheetOpen(false)} />}

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
    </>
  );
}
