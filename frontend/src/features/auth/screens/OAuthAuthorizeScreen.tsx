import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, InlineNotification } from "@carbon/react";
import { Checkmark, Close } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useAuthLayoutMetadata } from "@/features/auth/contexts/AuthLayoutContext";
import { httpClient } from "@/infrastructure/api/http.client";

export default function OAuthAuthorizeScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientName = searchParams.get("client_name") || "QJudge OAuth Client";

  const clientId = searchParams.get("client_id");
  const redirectUri = searchParams.get("redirect_uri");
  const responseType = searchParams.get("response_type");
  const codeChallenge = searchParams.get("code_challenge");
  const codeChallengeMethod = searchParams.get("code_challenge_method");
  const state = searchParams.get("state");
  const scope = searchParams.get("scope") || "mcp";

  const isValid =
    clientId &&
    redirectUri &&
    responseType === "code" &&
    codeChallenge &&
    codeChallengeMethod;

  const metadata = useMemo(
    () => ({
      title: t("oauth.authorize.title"),
      subtitle: t("oauth.authorize.description", { clientName }),
    }),
    [clientName, t],
  );

  useAuthLayoutMetadata(metadata);

  const submit = async (decision: { scope: string } | { deny: true }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await httpClient.post("/api/oauth/approve/", {
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: responseType,
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
        state: state || undefined,
        ...decision,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.redirect_uri) {
        window.location.href = data.redirect_uri;
        return;
      }
      setError(data.error_description || data.error || "");
    } catch {
      setError("");
    }
    setLoading(false);
  };

  if (!isValid) {
    return (
      <div className="auth-form auth-consent">
        <InlineNotification
          kind="error"
          title={t("oauth.authorize.invalidRequest")}
          hideCloseButton
        />
      </div>
    );
  }

  return (
    <div className="auth-form auth-consent">
      {user && (
        <dl className="auth-consent-account">
          <dt className="auth-consent-label">{t("oauth.authorize.account")}</dt>
          <dd className="auth-consent-user">
            <span className="auth-consent-username">{user.username}</span>
            <span className="auth-consent-email">{user.email}</span>
          </dd>
        </dl>
      )}

      <p className="auth-consent-note">{t("oauth.authorize.grantNote")}</p>

      {error !== null && (
        <InlineNotification
          kind="error"
          lowContrast
          title={t("oauth.authorize.error")}
          subtitle={error || undefined}
          hideCloseButton
        />
      )}

      <div className="auth-actions auth-consent-actions">
        <Button
          kind="secondary"
          className="auth-submit-btn"
          onClick={() => submit({ deny: true })}
          disabled={loading}
          renderIcon={Close}
        >
          {t("oauth.authorize.deny")}
        </Button>
        <Button
          kind="primary"
          className="auth-submit-btn"
          onClick={() => submit({ scope })}
          disabled={loading}
          renderIcon={Checkmark}
        >
          {loading ? t("oauth.authorize.loading") : t("oauth.authorize.allow")}
        </Button>
      </div>
    </div>
  );
}
