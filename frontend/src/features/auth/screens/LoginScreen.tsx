import { useState } from "react";
import {
  TextInput,
  PasswordInput,
  Button,
  Form,
  InlineLoading,
} from "@carbon/react";
import { ArrowRight, Education } from "@carbon/icons-react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  getOAuthUrl,
  login,
} from "@/infrastructure/api/repositories/auth.repository";
import { useAuthOptions } from "@/features/auth/hooks";
import { getAuthedLandingPath } from "@/features/auth/utils/onboarding";
import { AuthProviderButton } from "@/features/auth/components/AuthProviderButton";
import { AuthProviderIcon } from "@/features/auth/components/AuthProviderIcon";
import { MobileActionFooter } from "@/shared/ui/MobileActionFooter";
import {
  PendingActionBanner,
  usePendingActions,
  PENDING_ACTIONS,
  storePendingAction,
} from "@/features/auth/pending-actions";

const TAKEOVER_ACTION = PENDING_ACTIONS.find((a) => a.key === "exam_takeover")!;
const PROVIDER_LOADING_SLOTS = Array.from({ length: 3 }, (_, index) => index);

const LoginPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { buildAuthLink } = usePendingActions();
  const { options, loading: authOptionsLoading } = useAuthOptions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoadingProvider, setOauthLoadingProvider] = useState<string | null>(null);
  const [error, setError] = useState("");
  const campusProviders = options.providers.filter((provider) => provider.category === "campus");
  const socialProviders = options.providers.filter((provider) => provider.category === "social");
  const hasExternalLogin = campusProviders.length > 0 || socialProviders.length > 0;
  const shouldShowProviderRow = authOptionsLoading || hasExternalLogin;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await login({ email, password });
      if (response.success) {
        const { access_token: _a, refresh_token: _r, ...safeData } = response.data;
        localStorage.setItem("user", JSON.stringify(safeData.user));
        window.location.href = getAuthedLandingPath(safeData.user);
      } else {
        setError(t("auth.login.failed"));
      }
    } catch (err: any) {
      const errorCode = err?.response?.data?.code;
      if (errorCode === "EXAM_TAKEOVER_REQUIRED") {
        const conflictToken = err.response.data.conflict_token;
        if (conflictToken) {
          storePendingAction(TAKEOVER_ACTION.storageKey, conflictToken);
          window.location.href = TAKEOVER_ACTION.getRedirectPath(conflictToken);
          return;
        }
      }
      if (err.response?.data?.error?.message) {
        setError(err.response.data.error.message);
      } else if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else {
        setError(t("auth.login.invalidCredentials"));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthLogin = async (provider: string) => {
    try {
      setOauthLoadingProvider(provider);
      setError("");
      const url = await getOAuthUrl(provider);
      window.location.href = url;
    } catch {
      setError(t("auth.login.oauthFailed"));
      setOauthLoadingProvider(null);
    }
  };

  return (
    <>
      <div className="auth-form">
        <PendingActionBanner />
        {/* Legacy order was credential-first; keep this external-first order easy to revert. */}
        {shouldShowProviderRow && (
          <div
            className="auth-oauth-group auth-oauth-group--primary"
            data-testid={authOptionsLoading ? "auth-provider-loading-row" : undefined}
            aria-hidden={authOptionsLoading ? "true" : undefined}
          >
            {authOptionsLoading ? (
              PROVIDER_LOADING_SLOTS.map((slot) => (
                <span
                  key={slot}
                  className="auth-oauth-btn auth-oauth-btn--placeholder"
                  data-testid="auth-provider-loading-slot"
                />
              ))
            ) : (
              <>
                {socialProviders.map((provider) => (
                  <AuthProviderButton
                    key={provider.key}
                    label={provider.display_name || provider.key}
                    onClick={() => handleOAuthLogin(provider.key)}
                    disabled={loading || (oauthLoadingProvider !== null && oauthLoadingProvider !== provider.key)}
                    loading={oauthLoadingProvider === provider.key}
                    icon={<AuthProviderIcon provider={provider} />}
                  />
                ))}
                {campusProviders.length > 0 && (
                  <AuthProviderButton
                    label={t("auth.login.schoolAuth", "學校認證")}
                    variant="sso"
                    onClick={() => navigate(buildAuthLink("/login/campus-sso"))}
                    disabled={loading || oauthLoadingProvider !== null}
                    icon={<Education size={20} className="auth-oauth-btn__icon" />}
                  />
                )}
              </>
            )}
          </div>
        )}

        {!options.email_password_enabled && error && (
          <p className="auth-error" data-testid="auth-form-error">
            {error}
          </p>
        )}

        {hasExternalLogin && options.email_password_enabled && (
          <div className="auth-divider">
            <span>{t("auth.login.emailDivider", "或使用帳號密碼登入")}</span>
          </div>
        )}

        {options.email_password_enabled && (
          <Form
            id="auth-login-form"
            onSubmit={handleLogin}
            className="auth-credential-form"
            data-testid="auth-login-form"
          >
            <TextInput
              id="email"
              className="auth-input-control"
              data-testid="auth-login-email"
              labelText={t("auth.login.email", "Email / Username")}
              placeholder={t("auth.login.emailPlaceholder", "信箱或使用者名稱")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <PasswordInput
              id="password"
              className="auth-input-control"
              data-testid="auth-login-password"
              labelText={t("auth.login.password", "密碼")}
              placeholder={t("auth.login.passwordPlaceholder", "密碼")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {error && (
              <p className="auth-error" data-testid="auth-form-error">
                {error}
              </p>
            )}

            <div className="auth-actions auth-actions--desktop-submit">
              {loading ? (
                <InlineLoading description={t("auth.login.loading", "登入中...")} />
              ) : (
                <Button
                  kind="primary"
                  type="submit"
                  className="auth-submit-btn"
                  data-testid="auth-login-submit"
                  renderIcon={ArrowRight}
                >
                  {t("auth.login.submit", "登入")}
                </Button>
              )}
            </div>
          </Form>
        )}
      </div>

      <div className="auth-footer auth-footer--desktop">
        <p>
          {t("auth.login.noAccount", "還沒有帳號？")}{" "}
          <Link
            to={buildAuthLink("/register")}
            className="auth-link"
            data-testid="auth-login-nav-register"
          >
            {t("auth.login.registerNow", "建立帳號")}
          </Link>
        </p>
      </div>

      <MobileActionFooter>
        <Button
          kind="secondary"
          size="2xl"
          onClick={() => navigate(buildAuthLink("/register"))}
          data-testid="auth-login-mobile-register"
        >
          {t("auth.login.registerNow", "建立帳號")}
        </Button>
        {options.email_password_enabled && (
          <Button
            kind="primary"
            size="2xl"
            type="submit"
            form="auth-login-form"
            disabled={loading}
            renderIcon={ArrowRight}
            data-testid="auth-login-mobile-submit"
          >
            {t("auth.login.submit", "登入")}
          </Button>
        )}
      </MobileActionFooter>
    </>
  );
};

export default LoginPage;
