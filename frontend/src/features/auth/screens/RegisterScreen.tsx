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
import { register } from "@/infrastructure/api/repositories/auth.repository";

type FieldErrors = Record<string, string[]>;

const RegisterPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

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
        localStorage.setItem("user", JSON.stringify(response.data.user));
        navigate("/dashboard");
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

  return (
    <>
      <div className="auth-header">
        <h1 className="auth-title">{t("auth.register.title")}</h1>
        <p className="auth-subtitle">{t("auth.register.subtitle")}</p>
      </div>

      <Form onSubmit={handleRegister} className="auth-form">
        <TextInput
          id="username"
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
          labelText={t("auth.register.confirmPassword")}
          placeholder={t("auth.register.confirmPasswordPlaceholder")}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          invalid={!!getFieldError("password_confirm")}
          invalidText={getFieldError("password_confirm")}
          required
        />

        {error && <p className="auth-error">{error}</p>}

        <div className="auth-actions">
          {loading ? (
            <InlineLoading description={t("auth.register.loading")} />
          ) : (
            <Button kind="primary" type="submit" className="auth-submit-btn" renderIcon={ArrowRight}>
              {t("auth.register.submit")}
            </Button>
          )}
        </div>
      </Form>

      <div className="auth-footer">
        <p>
          {t("auth.register.hasAccount")}{" "}
          <Link to="/login" className="auth-link">
            {t("auth.register.loginNow")}
          </Link>
        </p>
      </div>
    </>
  );
};

export default RegisterPage;
