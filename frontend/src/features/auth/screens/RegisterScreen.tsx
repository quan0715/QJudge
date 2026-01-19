import { useState } from "react";
import {
  Form,
  TextInput,
  PasswordInput,
  Button,
  InlineLoading,
} from "@carbon/react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { register } from "@/infrastructure/api/repositories/auth.repository";
import MatrixBackground from "../components/MatrixBackground";
import "./AuthPages.css";

const RegisterPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError(t("auth.register.passwordMismatch"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await register({
        username,
        email,
        password,
        password_confirm: confirmPassword,
      });
      if (response.success) {
        localStorage.setItem("token", response.data.access_token);
        localStorage.setItem("user", JSON.stringify(response.data.user));
        navigate("/dashboard");
      } else {
        setError(t("auth.register.failed"));
      }
    } catch (err: any) {
      if (err.response?.data?.error?.message) {
        setError(err.response.data.error.message);
      } else {
        setError(t("auth.register.failedRetry"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <MatrixBackground />

      <div className="auth-modal">
        {/* Title */}
        <div className="auth-header">
          <h1 className="auth-title">{t("auth.register.title")}</h1>
          <p className="auth-subtitle">{t("auth.register.subtitle")}</p>
        </div>

        {/* Form */}
        <Form onSubmit={handleRegister} className="auth-form">
          <TextInput
            id="username"
            labelText={t("auth.register.username")}
            placeholder={t("auth.register.usernamePlaceholder")}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />

          <TextInput
            id="email"
            labelText={t("auth.register.email")}
            placeholder={t("auth.register.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <PasswordInput
            id="password"
            labelText={t("auth.register.password")}
            placeholder={t("auth.register.passwordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <PasswordInput
            id="confirm-password"
            labelText={t("auth.register.confirmPassword")}
            placeholder={t("auth.register.confirmPasswordPlaceholder")}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />

          {error && <p className="auth-error">{error}</p>}

          <div className="auth-actions">
            {loading ? (
              <InlineLoading description={t("auth.register.loading")} />
            ) : (
              <Button kind="primary" type="submit" className="auth-submit-btn">
                {t("auth.register.submit")}
              </Button>
            )}
          </div>
        </Form>

        {/* Footer */}
        <div className="auth-footer">
          <p>
            {t("auth.register.hasAccount")}{" "}
            <Link to="/login" className="auth-link">
              {t("auth.register.loginNow")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
