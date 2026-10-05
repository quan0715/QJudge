import { useState } from "react";
import { Button, Form, InlineNotification, PasswordInput } from "@carbon/react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { completePasswordReset } from "@/infrastructure/api/repositories/auth.repository";
import { clearAuthStorage } from "@/infrastructure/api/http.client";

const ResetPasswordScreen = () => {
  const location = useLocation();
  const token = new URLSearchParams(location.hash.slice(1)).get("token") || "";
  return <ResetPasswordForm key={token} token={token} />;
};

const ResetPasswordForm = ({ token }: { token: string }) => {
  const { t } = useTranslation("common");
  const { setUser } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const validToken = /^[A-Za-z0-9_-]{43}$/.test(token);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading || !validToken) return;
    if (password !== confirmation) { setError(t("auth.passwordReset.mismatch")); return; }
    setLoading(true);
    setError("");
    try {
      await completePasswordReset(token, password, confirmation);
      clearAuthStorage();
      setUser(null);
      setPassword("");
      setConfirmation("");
      setDone(true);
      window.history.replaceState(window.history.state, "", window.location.pathname);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.passwordReset.failed"));
    } finally {
      setLoading(false);
    }
  };

  return <>
    {done ? <InlineNotification kind="success" title={t("auth.passwordReset.completed")} subtitle={t("auth.passwordReset.loginAgain")} hideCloseButton /> : !validToken ?
      <p className="auth-error" role="alert">{t("auth.passwordReset.invalidLink")}</p> :
      <Form className="auth-form" onSubmit={submit}>
        <PasswordInput id="reset-password" labelText={t("auth.passwordReset.password")} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={128} />
        <PasswordInput id="reset-confirmation" labelText={t("auth.passwordReset.confirmation")} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required maxLength={128} />
        {error && <p className="auth-error" role="alert">{error}</p>}
        <Button className="auth-submit-btn" type="submit" disabled={loading}>{loading ? t("auth.passwordReset.loading") : t("auth.passwordReset.reset")}</Button>
      </Form>}
    <div className="auth-footer auth-recovery-links">
      {!done && <Link className="auth-link" to="/forgot-password">{t("auth.passwordReset.requestAnother")}</Link>}
      <Link className="auth-link" to="/login">{t("auth.passwordReset.backToLogin")}</Link>
    </div>
  </>;
};

export default ResetPasswordScreen;
