import { useState, useEffect } from "react";
import {
  HeaderGlobalAction,
  HeaderPanel,
  Switcher,
  SwitcherItem,
  SwitcherDivider,
  Modal,
  TextInput,
  InlineLoading,
} from "@carbon/react";
import {
  Login,
  Logout,
  UserAvatar,
  Password,
  Light,
  Asleep,
  Laptop,
  Language,
  Settings,
  DocumentAdd,
  Events,
  UserMultiple,
  Bullhorn,
  Edit,
} from "@carbon/icons-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/domains/auth/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { ChangePasswordModal } from "@/domains/auth/components/ChangePasswordModal";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { SUPPORTED_LANGUAGES } from "@/i18n";
import type { ThemePreference } from "@/core/entities/auth.entity";
import type { ContestDetail } from "@/core/entities/contest.entity";
import { updateNickname } from "@/services/contest";
import "./UserMenu.scss";

interface UserMenuProps {
  /** Whether another panel is expanded (to close this one) */
  otherPanelExpanded?: boolean;
  /** Callback when this panel expands/collapses */
  onExpandedChange?: (expanded: boolean) => void;
  /** Contest mode - only show theme/language options, no navigation */
  contestMode?: boolean;
  /** Contest data (for nickname editing in anonymous mode) */
  contest?: ContestDetail | null;
  /** Callback to refresh contest data after nickname update */
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
  const { t } = useTranslation();
  const { t: tContest } = useTranslation("contest");
  const { themePreference, updateTheme, language, updateLanguage } =
    useUserPreferences();

  const [isExpandedInternal, setIsExpandedInternal] = useState(false);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] =
    useState(false);
  const [isNicknameModalOpen, setIsNicknameModalOpen] = useState(false);
  const [nickname, setNickname] = useState(contest?.myNickname || "");
  const [nicknameLoading, setNicknameLoading] = useState(false);

  // Update nickname state when contest changes
  useEffect(() => {
    if (contest?.myNickname) {
      setNickname(contest.myNickname);
    }
  }, [contest?.myNickname]);

  // If other panel is expanded, this one should be closed
  const isExpanded = isExpandedInternal && !otherPanelExpanded;

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      // Don't close if clicking on the toggle button (identified by aria-label)
      const userMenuButton = document.querySelector(
        '[aria-label="' + t("header.userMenu") + '"]'
      );
      if (userMenuButton?.contains(target)) {
        return;
      }

      // Don't close if clicking inside the panel (check by class name since it may be portaled)
      const panel = target.closest(".cds--header-panel");
      const switcher = target.closest(".user-menu-container");
      if (panel || switcher) {
        return;
      }

      // Close if clicking outside
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

  const handleLogout = () => {
    logout();
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

  // Can edit nickname if in contest mode, anonymous mode is enabled, and exam not in progress (unless admin)
  const canEditNickname =
    contestMode &&
    contest?.anonymousModeEnabled &&
    (contest.examStatus !== "in_progress" ||
      contest.currentUserRole === "admin");

  const themeOptions: {
    value: ThemePreference;
    labelKey: string;
    icon: React.ReactNode;
  }[] = [
    { value: "light", labelKey: "theme.light", icon: <Light size={16} /> },
    { value: "dark", labelKey: "theme.dark", icon: <Asleep size={16} /> },
    { value: "system", labelKey: "theme.system", icon: <Laptop size={16} /> },
  ];

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
        <Switcher
          aria-label={t("header.userMenu")}
          className="user-menu-container"
        >
          {/* User Info - Show nickname in contest mode with anonymous */}
          <SwitcherItem
            className="user-info-item"
            aria-label={user?.username || user?.email || ""}
          >
            <div className="user-info-content">
              <span className="user-info-name">
                {contestMode && contest?.anonymousModeEnabled
                  ? contest.myNickname || tContest("avatar.participant")
                  : user?.username || user?.email}
              </span>
              <span className="user-info-role">
                {contestMode && contest
                  ? contest.currentUserRole === "admin" ||
                    contest.currentUserRole === "teacher"
                    ? tContest("avatar.admin")
                    : tContest("avatar.student")
                  : getRoleLabel(user?.role)}
              </span>
            </div>
          </SwitcherItem>

          {/* Edit Nickname - Contest mode with anonymous mode */}
          {canEditNickname && (
            <>
              <SwitcherItem
                className="action-item"
                aria-label={tContest("avatar.editNickname")}
                onClick={() => {
                  setIsNicknameModalOpen(true);
                  setIsExpandedInternal(false);
                  onExpandedChange?.(false);
                }}
              >
                <Edit size={20} />
                <span>{tContest("avatar.editNickname")}</span>
              </SwitcherItem>
              <SwitcherDivider />
            </>
          )}

          {/* Theme Section */}
          <SwitcherItem
            className="section-label"
            aria-label={t("preferences.themeSection")}
          >
            <Light size={16} />
            <span>{t("preferences.themeSection")}</span>
          </SwitcherItem>
          <SwitcherItem
            className="options-row"
            aria-label={t("preferences.themeSection")}
          >
            {themeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`option-btn ${
                  themePreference === option.value ? "selected" : ""
                }`}
                onClick={() => handleThemeChange(option.value)}
                aria-label={t(option.labelKey)}
                title={t(option.labelKey)}
              >
                {option.icon}
              </button>
            ))}
          </SwitcherItem>
          <SwitcherDivider />

          {/* Language Section */}
          <SwitcherItem
            className="section-label"
            aria-label={t("preferences.languageSection")}
          >
            <Language size={16} />
            <span>{t("preferences.languageSection")}</span>
          </SwitcherItem>
          <SwitcherItem
            className="options-row"
            aria-label={t("preferences.languageSection")}
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <button
                key={lang.id}
                type="button"
                className={`option-btn ${
                  language === lang.id ? "selected" : ""
                }`}
                onClick={() => handleLanguageChange(lang.id)}
                aria-label={lang.label}
                title={lang.label}
              >
                {lang.shortLabel}
              </button>
            ))}
          </SwitcherItem>

          {/* Management Section (teacher/admin only) - Hidden in contest mode */}
          {!contestMode &&
            (user?.role === "admin" || user?.role === "teacher") && (
              <>
                <SwitcherDivider />
                <SwitcherItem
                  className="section-label"
                  aria-label={t("header.management")}
                >
                  <Settings size={16} />
                  <span>{t("header.management")}</span>
                </SwitcherItem>
                <SwitcherItem
                  className="action-item"
                  aria-label={t("header.problemManagement")}
                  onClick={() => {
                    navigate("/management/problems");
                    setIsExpandedInternal(false);
                    onExpandedChange?.(false);
                  }}
                >
                  <DocumentAdd size={20} />
                  <span>{t("header.problemManagement")}</span>
                </SwitcherItem>
                <SwitcherItem
                  className="action-item"
                  aria-label={t("header.createContest")}
                  onClick={() => {
                    navigate("/contests/new");
                    setIsExpandedInternal(false);
                    onExpandedChange?.(false);
                  }}
                >
                  <Events size={20} />
                  <span>{t("header.createContest")}</span>
                </SwitcherItem>
              </>
            )}

          {/* Admin Section - Hidden in contest mode */}
          {!contestMode && user?.role === "admin" && (
            <>
              <SwitcherItem
                className="action-item"
                aria-label={t("header.userManagement")}
                onClick={() => {
                  navigate("/system/users");
                  setIsExpandedInternal(false);
                  onExpandedChange?.(false);
                }}
              >
                <UserMultiple size={20} />
                <span>{t("header.userManagement")}</span>
              </SwitcherItem>
              <SwitcherItem
                className="action-item"
                aria-label={t("header.announcements")}
                onClick={() => {
                  navigate("/management/announcements");
                  setIsExpandedInternal(false);
                  onExpandedChange?.(false);
                }}
              >
                <Bullhorn size={20} />
                <span>{t("header.announcements")}</span>
              </SwitcherItem>
              <SwitcherItem
                className="action-item"
                aria-label={t("header.environmentSettings")}
                onClick={() => {
                  navigate("/system/environment");
                  setIsExpandedInternal(false);
                  onExpandedChange?.(false);
                }}
              >
                <Settings size={20} />
                <span>{t("header.environmentSettings")}</span>
              </SwitcherItem>
            </>
          )}

          {/* Actions section - Hidden in contest mode */}
          {!contestMode && (
            <>
              <SwitcherDivider />

              {/* Change Password (only for email users) */}
              {canChangePassword && (
                <>
                  <SwitcherItem
                    className="action-item"
                    aria-label={t("preferences.changePassword")}
                    onClick={handleChangePasswordClick}
                  >
                    <Password size={20} />
                    <span>{t("preferences.changePassword")}</span>
                  </SwitcherItem>
                  <SwitcherDivider />
                </>
              )}

              {/* Logout */}
              <SwitcherItem
                className="action-item"
                aria-label={t("button.logout")}
                onClick={handleLogout}
              >
                <Logout
                  size={20}
                  style={{ color: "var(--cds-support-error)" }}
                />
                <span className="logout-text">{t("button.logout")}</span>
              </SwitcherItem>
            </>
          )}
        </Switcher>
      </HeaderPanel>

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={isChangePasswordModalOpen}
        onClose={() => setIsChangePasswordModalOpen(false)}
      />

      {/* Nickname Edit Modal - Contest mode */}
      <Modal
        open={isNicknameModalOpen}
        modalHeading={tContest("avatar.editContestNickname")}
        primaryButtonText={
          nicknameLoading ? (
            <InlineLoading description={tContest("refreshing")} />
          ) : (
            tContest("avatar.save")
          )
        }
        secondaryButtonText={t("button.cancel")}
        primaryButtonDisabled={nicknameLoading}
        onRequestClose={() => setIsNicknameModalOpen(false)}
        onRequestSubmit={handleNicknameUpdate}
        size="xs"
      >
        <TextInput
          id="nickname-input"
          labelText={tContest("avatar.nicknameLabel")}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder={tContest("avatar.nicknamePlaceholder")}
        />
      </Modal>
    </>
  );
};

export default UserMenu;
