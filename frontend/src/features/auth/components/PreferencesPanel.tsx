/**
 * PreferencesPanel - 偏好設定面板
 *
 * 整合 Theme 和 Language 切換功能
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { FormGroup, TextInput, Tag, Button, InlineNotification } from "@carbon/react";
import { useTranslation } from "react-i18next";
import { ThemeSwitch } from "@/shared/ui/config/ThemeSwitch";
import { LanguageSwitch } from "@/shared/ui/config/LanguageSwitch";
import { ChangePasswordModal } from "@/features/auth/components/ChangePasswordModal";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useUserPreferences } from "@/features/auth/hooks/useUserPreferences";
import type { ThemePreference } from "@/core/entities/auth.entity";
import "./PreferencesPanel.scss";

const ROLE_TAG_TYPE: Record<string, "blue" | "green" | "purple"> = {
  student: "blue",
  teacher: "green",
  admin: "purple",
};

const getLoginMethod = (provider?: string | null) => {
  if (!provider || provider === "email") {
    return {
      labelKey: "preferences.loginMethodPassword",
      fallback: "帳號密碼",
      providerLabel: "Email",
      tagType: "cool-gray" as const,
      canChangePassword: true,
      canRequestPasswordReset: false,
      canEditAccount: true,
    };
  }

  return {
    labelKey: "preferences.loginMethodSso",
    fallback: "SSO",
    providerLabel: provider.toUpperCase(),
    tagType: "blue" as const,
    canChangePassword: false,
    canRequestPasswordReset: false,
    canEditAccount: false,
  };
};

export const PreferencesPanel: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const {
    themePreference,
    updateTheme,
    language,
    updateLanguage,
    displayName,
    updateDisplayName,
    updateAccountProfile,
    requestPasswordReset,
  } = useUserPreferences();

  const [localDisplayName, setLocalDisplayName] = useState(displayName);
  const [localUsername, setLocalUsername] = useState(user?.username ?? "");
  const [localEmail, setLocalEmail] = useState(user?.email ?? "");
  const [displayNameSaveState, setDisplayNameSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [accountSaveState, setAccountSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [accountSaveError, setAccountSaveError] = useState<string | null>(null);
  const [forgotPasswordState, setForgotPasswordState] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [forgotPasswordError, setForgotPasswordError] = useState<string | null>(null);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const savedNameRef = useRef(displayName);
  const debounceRef = useRef<number | undefined>(undefined);
  const saveStateResetRef = useRef<number | undefined>(undefined);
  const displayNameRequestIdRef = useRef(0);

  useEffect(() => {
    setLocalDisplayName(displayName);
    savedNameRef.current = displayName;
    setDisplayNameSaveState("idle");
    setDisplayNameError(null);
  }, [displayName]);

  useEffect(() => {
    setLocalUsername(user?.username ?? "");
    setLocalEmail(user?.email ?? "");
    setAccountSaveState("idle");
    setAccountSaveError(null);
  }, [user?.username, user?.email]);

  const loginMethod = getLoginMethod(user?.auth_provider);
  const canEditAccount = loginMethod.canEditAccount;
  const accountDirty =
    localUsername.trim() !== (user?.username ?? "") ||
    localEmail.trim() !== (user?.email ?? "");

  const persistDisplayName = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (trimmed === savedNameRef.current) {
        setDisplayNameSaveState("idle");
        setDisplayNameError(null);
        return true;
      }

      const requestId = ++displayNameRequestIdRef.current;
      setDisplayNameSaveState("saving");
      setDisplayNameError(null);
      window.clearTimeout(saveStateResetRef.current);

      try {
        await updateDisplayName(trimmed);
        if (requestId !== displayNameRequestIdRef.current) return true;
        savedNameRef.current = trimmed;
        setDisplayNameSaveState("saved");
        saveStateResetRef.current = window.setTimeout(() => {
          setDisplayNameSaveState("idle");
        }, 1200);
        return true;
      } catch (error) {
        if (requestId !== displayNameRequestIdRef.current) return false;
        const message =
          error instanceof Error && error.message
            ? error.message
            : t("preferences.displayNameSaveFailed", "顯示名稱更新失敗，請重試");
        setDisplayNameSaveState("error");
        setDisplayNameError(message);
        return false;
      }
    },
    [t, updateDisplayName],
  );

  const handleDisplayNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalDisplayName(val);
    if (displayNameSaveState === "error") {
      setDisplayNameSaveState("idle");
      setDisplayNameError(null);
    }
    window.clearTimeout(saveStateResetRef.current);
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void persistDisplayName(val);
    }, 800);
  };

  const handleDisplayNameBlur = () => {
    window.clearTimeout(debounceRef.current);
    void persistDisplayName(localDisplayName);
  };

  const handleDisplayNameRetry = () => {
    window.clearTimeout(debounceRef.current);
    void persistDisplayName(localDisplayName);
  };

  const handleSaveAccountProfile = async () => {
    if (!loginMethod.canEditAccount) return;
    const nextUsername = localUsername.trim();
    const nextEmail = localEmail.trim();
    if (!nextUsername || !nextEmail) {
      setAccountSaveState("error");
      setAccountSaveError(
        t("preferences.accountRequiredFields", "使用者名稱與電子郵件不可為空")
      );
      return;
    }
    if (nextUsername === (user?.username ?? "") && nextEmail === (user?.email ?? "")) {
      setAccountSaveState("idle");
      setAccountSaveError(null);
      return;
    }

    setAccountSaveState("saving");
    setAccountSaveError(null);

    try {
      await updateAccountProfile({
        username: nextUsername,
        email: nextEmail,
      });
      setAccountSaveState("saved");
      setTimeout(() => {
        setAccountSaveState("idle");
      }, 1500);
    } catch (error) {
      setAccountSaveState("error");
      setAccountSaveError(
        error instanceof Error && error.message
          ? error.message
          : t("preferences.accountSaveFailed", "帳號資訊更新失敗，請重試")
      );
    }
  };

  const handleForgotPassword = async () => {
    if (!loginMethod.canRequestPasswordReset) return;
    setForgotPasswordState("sending");
    setForgotPasswordError(null);
    try {
      await requestPasswordReset();
      setForgotPasswordState("sent");
    } catch (error) {
      setForgotPasswordState("error");
      setForgotPasswordError(
        error instanceof Error && error.message
          ? error.message
          : t("preferences.forgotPasswordRequestFailed", "忘記密碼請求失敗，請稍後再試")
      );
    }
  };

  useEffect(
    () => () => {
      window.clearTimeout(debounceRef.current);
      window.clearTimeout(saveStateResetRef.current);
    },
    [],
  );

  const handleThemeChange = async (theme: ThemePreference) => {
    await updateTheme(theme);
  };

  const handleLanguageChange = async (lang: string) => {
    await updateLanguage(lang);
  };

  return (
    <div className="preferences-panel">
      <div className="preferences-panel__section">
        <h3 className="preferences-panel__section-title">
          {t("preferences.accountInfo")}
        </h3>
        <div className="preferences-panel__account-info">
          <TextInput
            id="account-username"
            labelText={t("preferences.username")}
            value={localUsername}
            onChange={(event) => {
              setLocalUsername(event.target.value);
              if (accountSaveState !== "idle") {
                setAccountSaveState("idle");
                setAccountSaveError(null);
              }
            }}
            readOnly={!canEditAccount}
          />
          <TextInput
            id="account-email"
            labelText={t("preferences.email")}
            value={localEmail}
            onChange={(event) => {
              setLocalEmail(event.target.value);
              if (accountSaveState !== "idle") {
                setAccountSaveState("idle");
                setAccountSaveError(null);
              }
            }}
            readOnly={!canEditAccount}
          />
          <div className="preferences-panel__role-field">
            <span className="preferences-panel__role-label">
              {t("preferences.role")}
            </span>
            <Tag
              type={ROLE_TAG_TYPE[user?.role ?? "student"] ?? "blue"}
              className="preferences-panel__hug-tag"
            >
              {t(`user.role.${user?.role ?? "student"}`)}
            </Tag>
          </div>
          <div className="preferences-panel__role-field">
            <span className="preferences-panel__role-label">
              {t("preferences.loginMethod", "登入方式")}
            </span>
            <Tag
              type={loginMethod.tagType}
              className="preferences-panel__hug-tag"
            >
              {t(loginMethod.labelKey, loginMethod.fallback)} · {loginMethod.providerLabel}
            </Tag>
          </div>
          {canEditAccount ? (
            <div className="preferences-panel__account-actions">
              <Button
                kind="secondary"
                size="sm"
                onClick={handleSaveAccountProfile}
                disabled={!accountDirty || accountSaveState === "saving"}
                data-testid="account-profile-save-btn"
              >
                {accountSaveState === "saving"
                  ? t("preferences.accountSaving", "儲存中...")
                  : t("common.save", "Save")}
              </Button>
              {accountSaveState === "saved" ? (
                <p className="preferences-panel__display-name-status preferences-panel__display-name-status--success">
                  {t("preferences.accountSaved", "帳號資訊已更新")}
                </p>
              ) : null}
              {accountSaveState === "error" ? (
                <p className="preferences-panel__display-name-status preferences-panel__display-name-status--error">
                  {accountSaveError ||
                    t("preferences.accountSaveFailed", "帳號資訊更新失敗，請重試")}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="preferences-panel__readonly-note">
              {t(
                "preferences.accountReadonlyHintOAuth",
                "SSO/OAuth 帳號僅可修改顯示名稱；使用者名稱與電子郵件由身分提供者管理。"
              )}
            </p>
          )}
        </div>
      </div>

      <div className="preferences-panel__section">
        <h3 className="preferences-panel__section-title">
          {t("preferences.displayName")}
        </h3>
        <p className="preferences-panel__section-description">
          {t("preferences.displayNameDescription")}
        </p>
        <FormGroup legendText="">
          <TextInput
            id="display-name"
            labelText=""
            value={localDisplayName}
            onChange={handleDisplayNameChange}
            onBlur={handleDisplayNameBlur}
            maxLength={50}
            placeholder={t("preferences.displayName")}
          />
          {displayNameSaveState === "saving" ? (
            <p className="preferences-panel__display-name-status">
              {t("preferences.savingDisplayName", "儲存中...")}
            </p>
          ) : null}
          {displayNameSaveState === "saved" ? (
            <p className="preferences-panel__display-name-status preferences-panel__display-name-status--success">
              {t("preferences.displayNameSaved", "顯示名稱已更新")}
            </p>
          ) : null}
          {displayNameSaveState === "error" ? (
            <div className="preferences-panel__display-name-error">
              <p className="preferences-panel__display-name-status preferences-panel__display-name-status--error">
                {displayNameError ||
                  t("preferences.displayNameSaveFailed", "顯示名稱更新失敗，請重試")}
              </p>
              <Button
                kind="ghost"
                size="sm"
                data-testid="display-name-retry-btn"
                onClick={handleDisplayNameRetry}
              >
                {t("common.retry", "Retry")}
              </Button>
            </div>
          ) : null}
        </FormGroup>
      </div>

      <div className="preferences-panel__section">
        <h3 className="preferences-panel__section-title">
          {t("preferences.accountSecurity", "帳號安全")}
        </h3>
        <p className="preferences-panel__section-description">
          {t("preferences.accountSecurityDescription", "管理密碼與帳號登入安全設定")}
        </p>
        <FormGroup legendText="">
          <div className="preferences-panel__security-actions">
            <Button
              kind="secondary"
              onClick={() => setIsChangePasswordModalOpen(true)}
              disabled={!loginMethod.canChangePassword}
            >
              {t("preferences.changePassword", "變更密碼")}
            </Button>
            <Button
              kind="ghost"
              disabled={!loginMethod.canRequestPasswordReset || forgotPasswordState === "sending"}
              data-testid="forgot-password-request-btn"
              onClick={handleForgotPassword}
            >
              {forgotPasswordState === "sending"
                ? t("preferences.forgotPasswordRequesting", "送出中...")
                : t("preferences.forgotPassword", "忘記密碼")}
            </Button>
          </div>
          {!loginMethod.canChangePassword ? (
            <InlineNotification
              lowContrast
              hideCloseButton
              kind="info"
              title={t(
                "preferences.ssoPasswordManagedTitle",
                "SSO 帳號密碼由身分提供者管理"
              )}
              subtitle={t(
                "preferences.ssoPasswordManagedDesc",
                "請至學校/企業 SSO 系統變更或重設密碼。"
              )}
            />
          ) : (
            <InlineNotification
              lowContrast
              hideCloseButton
              kind="info"
              title={t("preferences.forgotPasswordPendingTitle", "忘記密碼功能暫未開放")}
              subtitle={t(
                "preferences.forgotPasswordPendingDesc",
                "目前尚未啟用郵件通知，若忘記密碼請聯絡管理員協助重設。"
              )}
            />
          )}
          {forgotPasswordState === "sent" ? (
            <InlineNotification
              lowContrast
              hideCloseButton
              kind="success"
              title={t("preferences.forgotPasswordSentTitle", "重設連結已送出")}
              subtitle={t(
                "preferences.forgotPasswordSentDesc",
                "若帳號可重設密碼，請至信箱查看重設連結。"
              )}
            />
          ) : null}
          {forgotPasswordState === "error" ? (
            <InlineNotification
              lowContrast
              hideCloseButton
              kind="error"
              title={t("preferences.forgotPasswordRequestFailedTitle", "忘記密碼請求失敗")}
              subtitle={
                forgotPasswordError ||
                t("preferences.forgotPasswordRequestFailed", "請稍後再試")
              }
            />
          ) : null}
        </FormGroup>
      </div>

      <div className="preferences-panel__section">
        <h3 className="preferences-panel__section-title">
          {t("preferences.theme")}
        </h3>
        <p className="preferences-panel__section-description">
          {t("preferences.themeDescription", "選擇您偏好的介面主題")}
        </p>
        <FormGroup legendText="">
          <ThemeSwitch
            value={themePreference as ThemePreference}
            onChange={handleThemeChange}
            showLabel
            testId="settings-theme-dropdown"
          />
        </FormGroup>
      </div>

      <div className="preferences-panel__section">
        <h3 className="preferences-panel__section-title">
          {t("preferences.language")}
        </h3>
        <p className="preferences-panel__section-description">
          {t("preferences.languageDescription", "選擇您偏好的介面語言")}
        </p>
        <FormGroup legendText="">
          <LanguageSwitch
            value={language}
            onChange={handleLanguageChange}
            showLabel
            testId="settings-language-dropdown"
          />
        </FormGroup>
      </div>

      <ChangePasswordModal
        isOpen={isChangePasswordModalOpen}
        onClose={() => setIsChangePasswordModalOpen(false)}
      />
    </div>
  );
};

export default PreferencesPanel;
