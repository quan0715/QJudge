import { useState, useEffect } from "react";
import {
  HeaderGlobalAction,
  HeaderPanel,
  Modal,
  TextInput,
  InlineLoading,
} from "@carbon/react";
import {
  Login,
  Logout,
  Edit,
  Code,
  Book,
  Settings,
  UserMultiple,
  Bullhorn,
  Microscope,
} from "@carbon/icons-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useSettingsDialog } from "@/features/auth/contexts/SettingsDialogContext";
import { useTranslation } from "react-i18next";
import { useUserPreferences } from "@/features/auth/hooks/useUserPreferences";
import type { ContestDetail } from "@/core/entities/contest.entity";
import { updateNickname } from "@/infrastructure/api/repositories";
import { Avatar } from "@/shared/ui/avatar";
import "./UserMenu.scss";

interface UserMenuProps {
  otherPanelExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  contestMode?: boolean;
  contest?: ContestDetail | null;
  onContestRefresh?: () => void;
}

export const UserMenu: React.FC<UserMenuProps> = ({
  otherPanelExpanded = false,
  onExpandedChange,
  contestMode = false,
  contest,
  onContestRefresh,
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
  const [isNicknameModalOpen, setIsNicknameModalOpen] = useState(false);
  const [nickname, setNickname] = useState(contest?.myNickname || "");
  const [nicknameLoading, setNicknameLoading] = useState(false);

  useEffect(() => {
    if (contest?.myNickname) {
      setNickname(contest.myNickname);
    }
  }, [contest?.myNickname]);

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

  const handleNicknameUpdate = async () => {
    if (!contest) return;
    setNicknameLoading(true);
    try {
      await updateNickname(contest.id, nickname);
      onContestRefresh?.();
      setIsNicknameModalOpen(false);
    } catch (error) {
      console.error("Failed to update nickname", error);
      alert(tContest("avatar.updateFailed"));
    } finally {
      setNicknameLoading(false);
    }
  };

  const canEditNickname =
    contestMode &&
    contest?.anonymousModeEnabled &&
    (contest.examStatus !== "in_progress" ||
      contest.currentUserRole === "admin");

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

          {/* Contest nickname */}
          {contestMode && canEditNickname && (
            <button
              type="button"
              className="user-menu-link"
              onClick={() => setIsNicknameModalOpen(true)}
            >
              <Edit size={16} />
              {tContest("avatar.editNickname")}
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
              openSettings();
              setIsExpandedInternal(false);
              onExpandedChange?.(false);
            }}
          >
            <Settings size={16} />
            {t("settings.title")}
          </button>

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
                  navigate("/admin/contest-bindings");
                  setIsExpandedInternal(false);
                  onExpandedChange?.(false);
                }}
              >
                <Book size={16} />
                {t("header.legacyContestBinding", "舊競賽綁定")}
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
        danger
        modalHeading={t("auth.logout.confirmTitle")}
        primaryButtonText={t("auth.logout.confirmButton")}
        secondaryButtonText={t("button.cancel")}
        onRequestClose={() => setIsLogoutModalOpen(false)}
        onRequestSubmit={handleLogout}
      >
        <p>{t("auth.logout.confirmMessage")}</p>
      </Modal>

      {/* Nickname Modal */}
      <Modal
        open={isNicknameModalOpen}
        modalHeading={tContest("avatar.editNickname")}
        primaryButtonText={tContest("button.save")}
        secondaryButtonText={tContest("button.cancel")}
        onRequestClose={() => setIsNicknameModalOpen(false)}
        onRequestSubmit={handleNicknameUpdate}
        primaryButtonDisabled={nicknameLoading}
      >
        <TextInput
          id="nickname-input"
          labelText={tContest("avatar.nickname")}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={20}
        />
        {nicknameLoading && (
          <InlineLoading description={tContest("avatar.saving")} />
        )}
      </Modal>

    </>
  );
};

export default UserMenu;
