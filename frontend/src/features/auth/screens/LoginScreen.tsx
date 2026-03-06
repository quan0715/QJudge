import { useState } from "react";
import {
  TextInput,
  PasswordInput,
  Button,
  Form,
  InlineLoading,
} from "@carbon/react";
import { ArrowRight } from "@carbon/icons-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  getOAuthUrl,
  login,
  resolveConflict,
} from "@/infrastructure/api/repositories/auth.repository";
import MatrixBackground from "../components/MatrixBackground";
import "./AuthPages.css";

const LoginPage = () => {
  const { t } = useTranslation();
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
    <div className="auth-page">
      <MatrixBackground />

      <div className="auth-modal">
        {/* Title */}
        <div className="auth-header">
          <h1 className="auth-title">{t("auth.login.title")}</h1>
          <p className="auth-subtitle">{t("auth.login.subtitle")}</p>
        </div>

        {/* Form */}
        <Form onSubmit={handleLogin} className="auth-form">
          <TextInput
            id="email"
            labelText={t("auth.login.email")}
            placeholder={t("auth.login.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <PasswordInput
            id="password"
            labelText={t("auth.login.password")}
            placeholder={t("auth.login.passwordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && <p className="auth-error">{error}</p>}

          <div className="auth-actions">
            {loading ? (
              <InlineLoading description={t("auth.login.loading")} />
            ) : (
              <Button kind="primary" type="submit" className="auth-submit-btn">
                {t("auth.login.submit")}
              </Button>
            )}
          </div>

          <div className="auth-divider">
            <span>{t("auth.login.or")}</span>
          </div>

          <Button
            kind="tertiary"
            renderIcon={ArrowRight}
            className="auth-oauth-btn"
            onClick={() => handleOAuthLogin("nycu")}
          >
            {t("auth.login.ssoLogin")}
          </Button>
        </Form>

        {/* Footer */}
        <div className="auth-footer">
          <p>
            {t("auth.login.noAccount")}{" "}
            <Link to="/register" className="auth-link">
              {t("auth.login.registerNow")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
