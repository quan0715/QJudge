import { useState } from "react";
import {
  TextInput,
  PasswordInput,
  Button,
  Form,
  InlineLoading,
} from "@carbon/react";
import { ArrowRight, LogoGithub, Education } from "@carbon/icons-react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  getOAuthUrl,
  login,
} from "@/infrastructure/api/repositories/auth.repository";
import { getAuthedLandingPath } from "@/features/auth/utils/onboarding";
import { PendingActionBanner, usePendingActions } from "@/features/auth/pending-actions";

const LoginPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { buildAuthLink } = usePendingActions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await login({ email, password });
      if (response.success) {
        localStorage.setItem("user", JSON.stringify(response.data.user));
        window.location.href = getAuthedLandingPath(response.data.user);
      } else {
        setError(t("auth.login.failed"));
      }
    } catch (err: any) {
      const errorCode = err?.response?.data?.code;
      if (errorCode === "EXAM_LOGIN_BLOCKED") {
        const exam = err.response.data.active_exam;
        setError(
          `考試「${exam?.contest_name || ""}」進行中，無法從其他裝置登入。` +
          `請回到原裝置完成考試後再試。`
        );
        return;
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
      setLoading(true);
      const url = await getOAuthUrl(provider);
      window.location.href = url;
    } catch {
      setError(t("auth.login.oauthFailed"));
      setLoading(false);
    }
  };

  return (
    <>
      <Form onSubmit={handleLogin} className="auth-form" data-testid="auth-login-form">
        <PendingActionBanner />
        <TextInput
          id="email"
          data-testid="auth-login-email"
          labelText={t("auth.login.email", "Email")}
          placeholder={t("auth.login.emailPlaceholder", "QStudent")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <PasswordInput
          id="password"
          data-testid="auth-login-password"
          labelText={t("auth.login.password", "密碼")}
          placeholder={t("auth.login.passwordPlaceholder", "••••••••")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && (
          <p className="auth-error" data-testid="auth-form-error">
            {error}
          </p>
        )}

        <div className="auth-actions">
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

        <div className="auth-divider">
          <span>{t("auth.login.or", "或使用其他方式登入")}</span>
        </div>


        <div className="auth-oauth-group">
          <button
            type="button"
            className="auth-oauth-btn auth-oauth-btn--sso"
            onClick={() => navigate(buildAuthLink("/login/campus-sso"))}
          >
            <Education size={20} className="auth-oauth-btn__icon" />
            <span className="auth-oauth-btn__label">{t("auth.login.ssoLogin", "校園身份驗證登入")}</span>
            <ArrowRight size={20} className="auth-oauth-btn__arrow" />
          </button>
          <button type="button" className="auth-oauth-btn" onClick={() => handleOAuthLogin("github")}>
            <LogoGithub size={20} className="auth-oauth-btn__icon" />
            <span className="auth-oauth-btn__label">{t("auth.login.githubLogin", "使用 GitHub 登入")}</span>
          </button>
          <button type="button" className="auth-oauth-btn" onClick={() => handleOAuthLogin("google")}>
            <span className="auth-oauth-btn__icon" style={{ width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>G</span>
            <span className="auth-oauth-btn__label">{t("auth.login.googleLogin", "使用 Google 登入")}</span>
          </button>
        </div>
      </Form>

      <div className="auth-footer">
        <p>
          {t("auth.login.noAccount", "還沒有帳號？")}{" "}
          <Link
            to={buildAuthLink("/register")}
            className="auth-link"
            data-testid="auth-login-nav-register"
          >
            {t("auth.login.registerNow", "立即註冊")}
          </Link>
        </p>
      </div>
    </>
  );
};

export default LoginPage;
