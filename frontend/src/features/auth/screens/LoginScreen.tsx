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
  resolveConflict,
} from "@/infrastructure/api/repositories/auth.repository";

const LoginPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
        window.location.href = "/dashboard";
      } else {
        setError(t("auth.login.failed"));
      }
    } catch (err: any) {
      const conflictCode = err?.response?.data?.code;
      const conflictToken = err?.response?.data?.conflict_token;
      if (conflictCode === "EXAM_CONFLICT_ACTIVE_SESSION" && conflictToken) {
        const accepted = window.confirm(
          "偵測到你有進行中的考試。是否要接管並鎖定舊裝置作答狀態？"
        );
        if (accepted) {
          try {
            const takeover = await resolveConflict({
              conflict_token: conflictToken,
              action: "takeover_lock",
            });
            if (takeover.success) {
              localStorage.setItem("user", JSON.stringify(takeover.data.user));
              window.location.href = "/dashboard";
              return;
            }
          } catch (resolveError: any) {
            setError(
              resolveError?.response?.data?.error?.message ||
                "接管失敗，請聯繫監考老師。"
            );
            return;
          }
        }
        setError("請回到原裝置完成考試，或請監考老師協助。");
        return;
      }
      if (err.response?.data?.error?.message) {
        setError(err.response.data.error.message);
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
      <div className="auth-header">
        <h1 className="auth-title">{t("auth.login.title", "登入")}</h1>
        <p className="auth-subtitle">{t("auth.login.subtitle", "歡迎回來，請登入您的帳號")}</p>
      </div>

      <Form onSubmit={handleLogin} className="auth-form">
        <TextInput
          id="email"
          labelText={t("auth.login.email", "Email")}
          placeholder={t("auth.login.emailPlaceholder", "QStudent")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <PasswordInput
          id="password"
          labelText={t("auth.login.password", "密碼")}
          placeholder={t("auth.login.passwordPlaceholder", "••••••••")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <p className="auth-error">{error}</p>}

        <div className="auth-actions">
          {loading ? (
            <InlineLoading description={t("auth.login.loading", "登入中...")} />
          ) : (
            <Button kind="primary" type="submit" className="auth-submit-btn" renderIcon={ArrowRight}>
              {t("auth.login.submit", "登入")}
            </Button>
          )}
        </div>

        <div className="auth-divider">
          <span>{t("auth.login.or", "或使用其他方式登入")}</span>
        </div>


        <div className="auth-oauth-group">
          <button type="button" className="auth-oauth-btn auth-oauth-btn--sso" onClick={() => navigate("/login/campus-sso")}>
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
          <Link to="/register" className="auth-link">
            {t("auth.login.registerNow", "立即註冊")}
          </Link>
        </p>
      </div>
    </>
  );
};

export default LoginPage;
