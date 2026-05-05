import { useState, useEffect } from "react";
import {
  HeaderGlobalAction,
  HeaderPanel,
  Modal,
} from "@carbon/react";
import {
  Login,
  Logout,
  Code,
  Book,
  RecentlyViewed,
  Settings,
  UserMultiple,
  Bullhorn,
  Microscope,
  DocumentBlank,
} from "@carbon/icons-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useSettingsDialog } from "@/features/auth/contexts/SettingsDialogContext";
import { useTranslation } from "react-i18next";
import { useUserPreferences } from "@/features/auth/hooks/useUserPreferences";
import type { ContestDetail } from "@/core/entities/contest.entity";
import { getClassroomContestDashboardPath } from "@/features/contest/domain/contestRoutePolicy";
import { Avatar } from "@/shared/ui/avatar";
import "./UserMenu.scss";

interface UserMenuProps {
  otherPanelExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  contestMode?: boolean;
  contest?: ContestDetail | null;
  onContestRefresh?: () => void;
  settingsOnly?: boolean;
}

export const UserMenu: React.FC<UserMenuProps> = ({
  otherPanelExpanded = false,
  onExpandedChange,
  contestMode = false,
  contest,
  settingsOnly = false,
}) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { t } = useTranslation("common");
  const { t: tContest } = useTranslation("contest");
  const { avatarUrl, displayName } =
    useUserPreferences();
  const { open: openSettings } = useSettingsDialog();

  const [isExpandedInternal, setIsExpandedInternal] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  const isExpanded = isExpandedInternal && !otherPanelExpanded;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const userMenuButton = document.querySelector(
        '[aria-label="' + t("header.userMenu") + '"]'
      );
      if (userMenuButton?.contains(target)) return;

      const panel = target.closest(".cds--header-panel");
      const switcher = target.closest(".user-menu-container");
      if (panel || switcher) return;

      if (isExpanded) {
        setIsExpandedInternal(false);
        onExpandedChange?.(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isExpanded, onExpandedChange, t]);

  const handleToggle = () => {
    if (settingsOnly) {
      openSettings();
      return;
    }
    const newState = !isExpandedInternal;
    setIsExpandedInternal(newState);
    onExpandedChange?.(newState);
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
    setIsExpandedInternal(false);
    onExpandedChange?.(false);
  };

  const handleLogoutRequest = () => {
    setIsLogoutModalOpen(true);
    setIsExpandedInternal(false);
    onExpandedChange?.(false);
  };

  const handleOpenStorybook = () => {
    setIsExpandedInternal(false);
    onExpandedChange?.(false);
    window.location.assign("/dev/storybook/");
  };

  const getRoleLabel = (role: string | undefined) => {
    if (!role) return t("user.role.student");
    return t(`user.role.${role}`);
  };


  if (!user) {
    return (
      <HeaderGlobalAction
        aria-label={t("button.login")}
        onClick={() => navigate("/login")}
      >
        <Login size={20} />
      </HeaderGlobalAction>
    );
  }

  return (
    <>
      <button
        data-testid="user-menu-toggle-btn"
        type="button"
        className={`user-menu-trigger ${isExpanded ? "user-menu-trigger--active" : ""}`}
        aria-label={t("header.userMenu")}
        onClick={handleToggle}
      >
        <Avatar
          name={displayName?.trim() || user.username || user.email || "User"}
          url={avatarUrl || undefined}
          size="sm"
        />
      </button>

      <HeaderPanel aria-label={t("header.userMenu")} expanded={isExpanded}>
        <div className="user-menu-container">
          {/* User Info */}
          <div className="user-menu-header">
            <Avatar
              name={displayName?.trim() || user.username || user.email || "User"}
              url={avatarUrl || undefined}
              size="sm"
            />
            <span className="user-menu-name">
              {user.username || user.email}
            </span>
            <span className="user-menu-role">{getRoleLabel(user.role)}</span>
          </div>

          {contestMode && contest?.boundClassroomId && (
            <button
              type="button"
              className="user-menu-link"
              onClick={() => {
                navigate(getClassroomContestDashboardPath(contest.boundClassroomId!, contest.id));
                setIsExpandedInternal(false);                onExpandedChange?.(false);
              }}
            >
              <Book size={16} />
              {tContest("adminLayout.header.backToHome", "前往競賽主頁")}
            </button>
          )}

          {/* Settings Link */}
          <button
            data-testid="user-menu-docs-btn"
            type="button"
            className="user-menu-link"
            onClick={() => {
              navigate("/docs");
              setIsExpandedInternal(false);
              onExpandedChange?.(false);
            }}
          >
            <Book size={16} />
            {t("nav.documentation")}
          </button>

          <button
            type="button"
            className="user-menu-link"
            onClick={() => {
              navigate("/changelog");
              setIsExpandedInternal(false);
              onExpandedChange?.(false);
            }}
          >
            <RecentlyViewed size={16} />
            {t("nav.changelog")}
          </button>

          <button
            type="button"
            className="user-menu-link"
            onClick={() => {
              openSettings();
              setIsExpandedInternal(false);
              onExpandedChange?.(false);
            }}
          >
            <Settings size={16} />
            {t("settings.title")}
          </button>

          {/* Teacher / Admin Links */}
          {(user.role === "teacher" || user.role === "admin") && (
            <>
              <div className="user-menu-divider" />
              <button
                type="button"
                className="user-menu-link"
                onClick={() => {
                  navigate("/drafts");
                  setIsExpandedInternal(false);
                  onExpandedChange?.(false);
                }}
              >
                <DocumentBlank size={16} />
                {t("header.draftProblems", "草稿題目")}
              </button>
            </>
          )}

          {/* Admin Links */}
          {user.role === "admin" && (
            <>
              <div className="user-menu-divider" />
              <button
                type="button"
                className="user-menu-link"
                onClick={() => {
                  navigate("/system/users");
                  setIsExpandedInternal(false);
                  onExpandedChange?.(false);
                }}
              >
                <UserMultiple size={16} />
                {t("header.userManagement", "用戶管理")}
              </button>
              <button
                type="button"
                className="user-menu-link"
                onClick={() => {
                  navigate("/admin/review-queue");
                  setIsExpandedInternal(false);
                  onExpandedChange?.(false);
                }}
              >
                <Microscope size={16} />
                {t("header.reviewQueue", "送審佇列")}
              </button>
              <button
                type="button"
                className="user-menu-link"
                onClick={() => {
                  navigate("/management/announcements");
                  setIsExpandedInternal(false);
                  onExpandedChange?.(false);
                }}
              >
                <Bullhorn size={16} />
                {t("header.announcements", "公告管理")}
              </button>
            </>
          )}

          {/* Dev Tools */}
          {import.meta.env.DEV && (
            <button
              type="button"
              className="user-menu-link"
              onClick={handleOpenStorybook}
            >
              <Code size={16} />
              Storybook
            </button>
          )}

          <button
            type="button"
            data-testid="user-menu-logout-request"
            className="user-menu-link user-menu-link--danger"
            onClick={handleLogoutRequest}
          >
            <Logout size={16} />
            {t("button.logout")}
          </button>
        </div>
      </HeaderPanel>

      {/* Logout Confirmation Modal */}
      <Modal
        open={isLogoutModalOpen}
        data-testid="user-menu-logout-modal"
        danger
        modalHeading={t("auth.logout.confirmTitle")}
        primaryButtonText={
          <span data-testid="user-menu-logout-confirm">
            {t("auth.logout.confirmButton")}
          </span>
        }
        secondaryButtonText={t("common:button.cancel")}
        onRequestClose={() => setIsLogoutModalOpen(false)}
        onRequestSubmit={handleLogout}
      >
        <p data-testid="user-menu-logout-message">{t("auth.logout.confirmMessage")}</p>
      </Modal>

    </>
  );
};

export default UserMenu;
