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
  UserAvatar,
  Password,
  Edit,
  Code,
} from "@carbon/icons-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { ChangePasswordModal } from "@/features/auth/components/ChangePasswordModal";
import { useUserPreferences } from "@/features/auth/hooks/useUserPreferences";
import type { ThemePreference } from "@/core/entities/auth.entity";
import type { ContestDetail } from "@/core/entities/contest.entity";
import { updateNickname } from "@/infrastructure/api/repositories";
import { ThemeSwitch } from "@/shared/ui/config/ThemeSwitch";
import { LanguageSwitch } from "@/shared/ui/config/LanguageSwitch";
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
  const { themePreference, updateTheme, language, updateLanguage } =
    useUserPreferences();

  const [isExpandedInternal, setIsExpandedInternal] = useState(false);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] =
    useState(false);
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

  const handleChangePasswordClick = () => {
    setIsExpandedInternal(false);
    onExpandedChange?.(false);
    setIsChangePasswordModalOpen(true);
  };

  const handleThemeChange = async (theme: ThemePreference) => {
    await updateTheme(theme);
  };

  const handleLanguageChange = async (lang: string) => {
    await updateLanguage(lang);
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

  const canChangePassword = user?.auth_provider === "email";

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
      <HeaderGlobalAction
        aria-label={t("header.userMenu")}
        isActive={isExpanded}
        onClick={handleToggle}
      >
        <UserAvatar size={20} />
      </HeaderGlobalAction>

      <HeaderPanel aria-label={t("header.userMenu")} expanded={isExpanded}>
        <div className="user-menu-container">
          {/* User Info */}
          <div className="user-menu-header">
            <UserAvatar size={20} />
            <span className="user-menu-name">
              {user.username || user.email}
            </span>
            <span className="user-menu-role">{getRoleLabel(user.role)}</span>
          </div>

          {/* Preferences */}
          <div className="user-menu-fields">
            <ThemeSwitch
              value={themePreference as ThemePreference}
              onChange={handleThemeChange}
              showLabel
            />
            <LanguageSwitch
              value={language}
              onChange={handleLanguageChange}
              showLabel
            />
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

          {/* Dev Tools */}
          {import.meta.env.DEV && (
            <button
              type="button"
              className="user-menu-link"
              onClick={() => {
                navigate("/dev/storybook");
                setIsExpandedInternal(false);
                onExpandedChange?.(false);
              }}
            >
              <Code size={16} />
              Storybook
            </button>
          )}

          {/* Actions */}
          {canChangePassword && (
            <button
              type="button"
              className="user-menu-link"
              onClick={handleChangePasswordClick}
            >
              <Password size={16} />
              {t("user.changePassword")}
            </button>
          )}

          <button
            type="button"
            className="user-menu-link user-menu-link--danger"
            onClick={handleLogout}
          >
            <Logout size={16} />
            {t("button.logout")}
          </button>
        </div>
      </HeaderPanel>

      <ChangePasswordModal
        isOpen={isChangePasswordModalOpen}
        onClose={() => setIsChangePasswordModalOpen(false)}
      />

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
