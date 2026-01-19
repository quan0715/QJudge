import { useState, useEffect } from "react";
import {
  HeaderGlobalAction,
  HeaderPanel,
  Modal,
  TextInput,
  InlineLoading,
  Button,
} from "@carbon/react";
import {
  Login,
  Logout,
  UserAvatar,
  Password,
  UserMultiple,
  Edit,
  Code,
  Light,
  Language,
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
          {/* Profile Section */}
          <div className="user-menu-profile">
            <div className="user-menu-profile-inner">
              <div className="user-menu-avatar">
                <UserAvatar size={20} />
              </div>
              <div className="user-menu-info">
                <span className="user-menu-name">
                  {user.username || user.email}
                </span>
                <span className="user-menu-role">
                  {getRoleLabel(user.role)}
                </span>
              </div>
            </div>
          </div>

          {/* Preferences Section */}
          <div className="user-menu-section">
            <div className="user-menu-preferences">
              <div className="user-menu-pref-row">
                <span className="user-menu-pref-label">
                  <Light size={16} />
                  {t("theme.title")}
                </span>
                <div className="user-menu-pref-control">
                  <ThemeSwitch
                    value={themePreference as ThemePreference}
                    onChange={handleThemeChange}
                    showLabel={false}
                  />
                </div>
              </div>
              <div className="user-menu-pref-row">
                <span className="user-menu-pref-label">
                  <Language size={16} />
                  {t("language.title")}
                </span>
                <div className="user-menu-pref-control">
                  <LanguageSwitch
                    value={language}
                    onChange={handleLanguageChange}
                    showLabel={false}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Contest Mode: nickname edit */}
          {contestMode && canEditNickname && (
            <div className="user-menu-section">
              <div className="user-menu-section-title">
                <UserMultiple size={16} />
                {tContest("avatar.nickname")}
              </div>
              <Button
                kind="tertiary"
                size="sm"
                onClick={() => setIsNicknameModalOpen(true)}
                renderIcon={Edit}
              >
                {tContest("avatar.editNickname")}
              </Button>
              <p className="user-menu-hint">
                {tContest("avatar.nicknameHint")}
              </p>
            </div>
          )}

          {/* Dev Tools (Dev Only) */}
          {import.meta.env.DEV && (
            <div className="user-menu-section user-menu-dev-tools">
              <div className="user-menu-section-title">
                <Code size={16} />
                {"</>"} Dev Tools
              </div>
              <Button
                kind="ghost"
                size="sm"
                onClick={() => {
                  navigate("/dev/storybook");
                  setIsExpandedInternal(false);
                  onExpandedChange?.(false);
                }}
                renderIcon={Code}
              >
                Storybook
              </Button>
            </div>
          )}

          {/* Account Actions */}
          <div className="user-menu-actions">
            {canChangePassword && (
              <Button
                kind="ghost"
                size="sm"
                onClick={handleChangePasswordClick}
                renderIcon={Password}
              >
                {t("user.changePassword")}
              </Button>
            )}
            <Button
              kind="danger--ghost"
              size="sm"
              onClick={handleLogout}
              renderIcon={Logout}
            >
              {t("button.logout")}
            </Button>
          </div>
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
