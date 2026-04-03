import { useState } from "react";
import {
  Button,
  Form,
  InlineLoading,
  TextInput,
  InlineNotification,
} from "@carbon/react";
import { Checkmark } from "@carbon/icons-react";
import { useNavigate } from "react-router-dom";
import type { ThemePreference, User } from "@/core/entities/auth.entity";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useAuthLayoutMetadata } from "@/features/auth/contexts/AuthLayoutContext";
import { useTheme } from "@/shared/ui/theme/ThemeContext";
import { useContentLanguage } from "@/shared/contexts/ContentLanguageContext";
import { LanguageSwitch, ThemeSwitch } from "@/shared/ui/config";
import { updatePreferences } from "@/infrastructure/api/repositories/auth.repository";
import { getAuthedLandingPath } from "@/features/auth/utils/onboarding";
import type { SupportedLanguage } from "@/i18n";

const OnboardingScreen = () => {
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const { setPreference } = useTheme();
  const { setContentLanguage } = useContentLanguage();
  const [displayName, setDisplayName] = useState(user?.profile?.display_name ?? user?.username ?? "");
  const [preferredLanguage, setPreferredLanguage] = useState(
    user?.profile?.preferred_language ?? "zh-TW"
  );
  const [preferredTheme, setPreferredTheme] = useState<ThemePreference>(
    user?.profile?.preferred_theme ?? "system"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useAuthLayoutMetadata({
    title: "完成基本設定",
    subtitle: "先設定顯示名稱與偏好，之後都可以在設定中修改。",
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;

    const trimmedDisplayName = displayName.trim();
    if (!trimmedDisplayName) {
      setError("請先填寫顯示名稱");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await updatePreferences({
        display_name: trimmedDisplayName,
        preferred_language: preferredLanguage,
        preferred_theme: preferredTheme,
        onboarding_completed_at: new Date().toISOString(),
      });

      const preferences = response.data;

      const nextUser: User = {
        ...user,
        profile: {
          solved_count: user.profile?.solved_count ?? 0,
          submission_count: user.profile?.submission_count ?? 0,
          accept_rate: user.profile?.accept_rate ?? 0,
          ...preferences,
        },
      };

      setPreference(preferences.preferred_theme);
      setContentLanguage(preferences.preferred_language as SupportedLanguage);
      setUser(nextUser);
      localStorage.setItem("user", JSON.stringify(nextUser));
      window.dispatchEvent(new Event("storage"));
      navigate(getAuthedLandingPath(nextUser), { replace: true });
    } catch (err: any) {
      setError(
        err?.response?.data?.error?.message ||
          err?.message ||
          "無法完成初始設定，請稍後再試"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Form onSubmit={handleSubmit} className="auth-form">
        <TextInput
          id="onboarding-display-name"
          labelText="顯示名稱"
          placeholder="你希望被怎麼稱呼"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          required
        />

        <LanguageSwitch
          value={preferredLanguage}
          onChange={(value) => setPreferredLanguage(value as SupportedLanguage)}
          label="內容語言"
          size="lg"
        />

        <ThemeSwitch
          value={preferredTheme}
          onChange={(value) => setPreferredTheme(value as ThemePreference)}
          label="介面主題"
          size="lg"
        />

        {error ? (
          <InlineNotification
            kind="error"
            title="設定失敗"
            subtitle={error}
            lowContrast
            hideCloseButton
          />
        ) : null}

        <div className="auth-actions">
          {loading ? (
            <InlineLoading description="儲存中..." />
          ) : (
            <Button kind="primary" type="submit" className="auth-submit-btn" renderIcon={Checkmark}>
              開始使用
            </Button>
          )}
        </div>
      </Form>
    </>
  );
};

export default OnboardingScreen;
