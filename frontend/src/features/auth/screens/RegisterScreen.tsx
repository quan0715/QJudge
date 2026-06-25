import { useState } from "react";
import {
  Form,
  TextInput,
  PasswordInput,
  Button,
  InlineLoading,
} from "@carbon/react";
import { ArrowRight } from "@carbon/icons-react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { AuthProviderOption } from "@/core/entities/auth.entity";
import { getOAuthUrl, register } from "@/infrastructure/api/repositories/auth.repository";
import { useAuthOptions } from "@/features/auth/hooks";
import { getAuthedLandingPath } from "@/features/auth/utils/onboarding";
import { AuthProviderButton } from "@/features/auth/components/AuthProviderButton";
import { AuthProviderIcon } from "@/features/auth/components/AuthProviderIcon";
import { PendingActionBanner, usePendingActions } from "@/features/auth/pending-actions";
import { MobileActionFooter } from "@/shared/ui/MobileActionFooter";

type FieldErrors = Record<string, string[]>;

const RegisterPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { buildAuthLink } = usePendingActions();
  const { options } = useAuthOptions();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [providerLoading, setProviderLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const registrationProviders = options.providers.filter((provider) => provider.supports_registration);
  const orderedRegistrationProviders = [
    ...registrationProviders.filter((provider) => provider.category === "social"),
    ...registrationProviders.filter((provider) => provider.category === "campus"),
  ];

  const getRegistrationProviderLabel = (provider: AuthProviderOption): string => {
    if (provider.category === "campus") {
      return t("auth.login.schoolAuth", "學校認證");
    }
    return provider.display_name || provider.key;
  };
  const hasRegistrationProviders = orderedRegistrationProviders.length > 0;

  const getFieldError = (field: string): string | undefined =>
    fieldErrors[field]?.join("、");

  const validateLocal = (): boolean => {
    const errors: FieldErrors = {};

    if (password && password.length < 8) {
      errors.password = [t("auth.register.passwordTooShort", "密碼至少需要 8 個字元")];
    }
    if (confirmPassword && password !== confirmPassword) {
      errors.password_confirm = [t("auth.register.passwordMismatch", "密碼不一致")];
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateLocal()) return;

    setLoading(true);
    setError("");
    setFieldErrors({});

    try {
      const response = await register({
        username,
        email,
        password,
        password_confirm: confirmPassword,
      });
      if (response.success) {
        const { access_token: _a, refresh_token: _r, ...safeData } = response.data;
        localStorage.setItem("user", JSON.stringify(safeData.user));
        window.location.href = getAuthedLandingPath(safeData.user);
      } else {
        setError(t("auth.register.failed"));
      }
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.error?.details) {
        setFieldErrors(data.error.details);
        setError(data.error.message || t("auth.register.failed"));
      } else if (data?.error?.message) {
        setError(data.error.message);
      } else {
        setError(t("auth.register.failedRetry"));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleProviderRegister = async (provider: AuthProviderOption) => {
    try {
      setProviderLoading(provider.key);
      setError("");
      const url = await getOAuthUrl(provider.key);
      window.location.href = url;
    } catch {
      setError(t("auth.login.oauthFailed", "無法啟動登入流程"));
      setProviderLoading(null);
    }
  };

  return (
    <>
      <div className="auth-form">
        <PendingActionBanner />
        {hasRegistrationProviders && (
          <div className="auth-oauth-group auth-oauth-group--primary">
            {orderedRegistrationProviders.map((provider) => (
              <AuthProviderButton
                key={provider.key}
                label={getRegistrationProviderLabel(provider)}
                variant={provider.category === "campus" ? "sso" : "default"}
                onClick={() => handleProviderRegister(provider)}
                disabled={loading || (providerLoading !== null && providerLoading !== provider.key)}
                loading={providerLoading === provider.key}
                icon={<AuthProviderIcon provider={provider} />}
              />
            ))}
          </div>
        )}

        {hasRegistrationProviders && options.email_password_enabled && (
          <div className="auth-divider">
            <span>{t("auth.register.emailDivider", "或使用 Email 註冊")}</span>
          </div>
        )}

        {options.email_password_enabled && (
          <Form
            id="auth-register-form"
            onSubmit={handleRegister}
            className="auth-credential-form"
            data-testid="auth-register-form"
          >
            <TextInput
              id="username"
              className="auth-input-control"
              data-testid="auth-register-username"
              labelText={t("auth.register.username")}
              placeholder={t("auth.register.usernamePlaceholder")}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              invalid={!!getFieldError("username")}
              invalidText={getFieldError("username")}
              required
            />

            <TextInput
              id="email"
              className="auth-input-control"
              data-testid="auth-register-email"
              type="email"
              labelText={t("auth.register.email")}
              placeholder={t("auth.register.emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              invalid={!!getFieldError("email")}
              invalidText={getFieldError("email")}
              required
            />

            <PasswordInput
              id="password"
              className="auth-input-control"
              data-testid="auth-register-password"
              labelText={t("auth.register.password")}
              placeholder={t("auth.register.passwordPlaceholder")}
              helperText={t("auth.register.passwordHelper", "至少 8 個字元，不能是純數字或常見密碼")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              invalid={!!getFieldError("password")}
              invalidText={getFieldError("password")}
              required
            />

            <PasswordInput
              id="confirm-password"
              className="auth-input-control"
              data-testid="auth-register-password-confirm"
              labelText={t("auth.register.confirmPassword")}
              placeholder={t("auth.register.confirmPasswordPlaceholder")}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              invalid={!!getFieldError("password_confirm")}
              invalidText={getFieldError("password_confirm")}
              required
            />

            <div className="auth-actions auth-actions--desktop-submit">
              {loading ? (
                <InlineLoading description={t("auth.register.loading")} />
              ) : (
                <Button
                  kind="primary"
                  type="submit"
                  className="auth-submit-btn"
                  data-testid="auth-register-submit"
                  renderIcon={ArrowRight}
                >
                  {t("auth.register.emailSubmit", "Email 註冊")}
                </Button>
              )}
            </div>
          </Form>
        )}

        {error && (
          <p className="auth-error" data-testid="auth-form-error">
            {error}
          </p>
        )}
      </div>

      <div className="auth-footer auth-footer--desktop">
        <p>
          {t("auth.register.hasAccount")}{" "}
          <Link
            to={buildAuthLink("/login")}
            className="auth-link"
            data-testid="auth-register-nav-login"
          >
            {t("auth.register.loginNow")}
          </Link>
        </p>
      </div>

      <MobileActionFooter>
        <Button
          kind="secondary"
          size="2xl"
          onClick={() => navigate(buildAuthLink("/login"))}
          data-testid="auth-register-mobile-login"
        >
          {t("auth.register.loginNow")}
        </Button>
        {options.email_password_enabled && (
          <Button
            kind="primary"
            size="2xl"
            type="submit"
            form="auth-register-form"
            disabled={loading}
            renderIcon={ArrowRight}
            data-testid="auth-register-mobile-submit"
          >
            {t("auth.register.emailSubmit", "Email 註冊")}
          </Button>
        )}
      </MobileActionFooter>
    </>
  );
};

export default RegisterPage;
