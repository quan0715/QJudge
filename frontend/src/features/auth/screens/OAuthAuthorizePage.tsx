import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, InlineNotification } from "@carbon/react";
import { Checkmark, Close } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useAuthLayoutMetadata } from "@/features/auth/contexts/AuthLayoutContext";
import { httpClient } from "@/infrastructure/api/http.client";

export default function OAuthAuthorizePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string>("QJudge OAuth Client");

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

  useEffect(() => {
    const name = searchParams.get("client_name");
    if (name) setClientName(name);
  }, [searchParams]);

  const metadata = useMemo(
    () => ({
      title: t("oauth.authorize.title", "MCP OAuth 授權"),
      subtitle: t("oauth.authorize.description", { clientName }),
    }),
    [clientName, t],
  );

  useAuthLayoutMetadata(metadata);

  const handleApprove = async () => {
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
        scope,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error_description || errData.error || t("oauth.authorize.error"));
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (data.redirect_uri) {
        window.location.href = data.redirect_uri;
      } else {
        setError(t("oauth.authorize.error"));
        setLoading(false);
      }
    } catch {
      setError(t("oauth.authorize.error"));
      setLoading(false);
    }
  };

  const handleDeny = async () => {
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
        deny: true,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error_description || errData.error || t("oauth.authorize.error"));
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (data.redirect_uri) {
        window.location.href = data.redirect_uri;
      } else {
        setError(t("oauth.authorize.error"));
        setLoading(false);
      }
    } catch {
      setError(t("oauth.authorize.error"));
      setLoading(false);
    }
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
      <div className="auth-consent-summary">
        <p className="auth-consent-kicker">MCP OAuth</p>
        <h2 className="auth-consent-client">{clientName}</h2>
        <p className="auth-consent-description">
          {t("oauth.authorize.description", { clientName })}
        </p>
        {user && (
          <p className="auth-consent-account">
            {user.username} ({user.email})
          </p>
        )}
      </div>

      {error && (
        <InlineNotification
          kind="error"
          title={error}
          hideCloseButton
        />
      )}

      <div className="auth-actions auth-consent-actions">
        <Button
          kind="secondary"
          className="auth-submit-btn"
          onClick={handleDeny}
          disabled={loading}
          renderIcon={Close}
        >
          {t("oauth.authorize.deny")}
        </Button>
        <Button
          kind="primary"
          className="auth-submit-btn"
          onClick={handleApprove}
          disabled={loading}
          renderIcon={Checkmark}
        >
          {loading ? t("oauth.authorize.loading") : t("oauth.authorize.allow")}
        </Button>
      </div>
    </div>
  );
}
