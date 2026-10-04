import { useState } from "react";
import { Button, Form, InlineLoading, InlineNotification, TextInput } from "@carbon/react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthLayoutMetadata } from "../contexts/AuthLayoutContext";
import { useAuthOptions } from "../hooks/useAuthOptions";
import { requestPasswordReset } from "@/infrastructure/api/repositories/auth.repository";

const ForgotPasswordScreen = () => {
  const { t } = useTranslation("common");
  const { options, loading: optionsLoading, error: optionsError, retry } = useAuthOptions();
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  useAuthLayoutMetadata({ title: t("auth.passwordReset.requestTitle"), subtitle: t("auth.passwordReset.requestSubtitle") });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading || !options.password_reset_enabled) return;
    setLoading(true);
    setError("");
    try {
      await requestPasswordReset(identifier.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.passwordReset.failed"));
    } finally {
      setLoading(false);
    }
  };

  return <>
    {optionsLoading ? <InlineLoading description={t("auth.passwordReset.loading")} /> : optionsError ?
      <Button kind="tertiary" onClick={retry}>{t("auth.passwordReset.retry")}</Button> : !options.password_reset_enabled ?
        <p role="status">{t("auth.passwordReset.disabled")}</p> : sent ?
          <InlineNotification kind="success" title={t("auth.passwordReset.requested")} subtitle={t("auth.passwordReset.genericMessage")} hideCloseButton /> :
          <Form className="auth-form" onSubmit={submit}>
            <TextInput id="reset-identifier" labelText={t("auth.passwordReset.identifier")} autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required maxLength={254} />
            {error && <p className="auth-error" role="alert">{error}</p>}
            <Button type="submit" disabled={loading}>{loading ? t("auth.passwordReset.loading") : t("auth.passwordReset.send")}</Button>
          </Form>}
    <Link to="/login">{t("auth.passwordReset.backToLogin")}</Link>
  </>;
};

export default ForgotPasswordScreen;
