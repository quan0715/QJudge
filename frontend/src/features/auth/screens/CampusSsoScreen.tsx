import { useState } from "react";
import { Button, InlineLoading } from "@carbon/react";
import { ArrowRight } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import type { AuthProviderOption } from "@/core/entities/auth.entity";
import { getOAuthUrl } from "@/infrastructure/api/repositories/auth.repository";
import { useAuthOptions } from "@/features/auth/hooks";
import { usePendingActions, PendingActionBanner } from "@/features/auth/pending-actions";
import { getProviderDescription, getProviderDisplayName } from "@/features/auth/utils/authProviderLabels";
import { MobileActionFooter } from "@/shared/ui/MobileActionFooter";

const ProviderLogo = ({ provider, alt }: { provider: AuthProviderOption; alt: string }) => {
  if (provider.logo_url) {
    return (
      <img
        src={provider.logo_url}
        alt={alt}
        className="auth-school-list-item__logo"
      />
    );
  }

  return <span className="auth-school-list-item__logo">{alt.charAt(0).toUpperCase()}</span>;
};

const CampusSsoScreen = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { options } = useAuthOptions();
  // Auto-syncs query params (e.g. teacher_activation_token) → sessionStorage
  const { buildAuthLink } = usePendingActions();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [selectedProviderKey, setSelectedProviderKey] = useState<string | null>(null);
  const isRegistrationSso = location.pathname.startsWith("/register/campus-sso");
  const backPath = isRegistrationSso ? "/register" : "/login";
  const backLabel = isRegistrationSso
    ? t("auth.campusSso.backToRegister", "返回建立帳號")
    : t("auth.campusSso.backToLogin", "返回登入");
  const verifyLabel = t("auth.campusSso.verify", "驗證");
  const campusProviders = options.providers.filter((provider) => provider.category === "campus");
  const selectedProvider = campusProviders.find((provider) => provider.key === selectedProviderKey);
  const isAuthenticating = loading !== null;

  const handleSsoLogin = async (providerId: string) => {
    try {
      setLoading(providerId);
      setError("");
      const url = await getOAuthUrl(providerId);
      window.location.href = url;
    } catch {
      setError(t("auth.login.oauthFailed", "無法啟動登入流程"));
      setLoading(null);
    }
  };

  const handleBack = () => {
    navigate(buildAuthLink(backPath));
  };

  const handleVerify = () => {
    if (!selectedProvider || isAuthenticating) return;
    void handleSsoLogin(selectedProvider.key);
  };

  return (
    <>
      <div className="auth-form">
        <PendingActionBanner />
        <div className="auth-school-list">
          {campusProviders.map((provider) => {
            const displayName = getProviderDisplayName(t, provider);
            const description = getProviderDescription(t, provider);
            const isSelected = selectedProviderKey === provider.key;

            return (
              <button
                key={provider.key}
                type="button"
                className="auth-school-list-item"
                aria-pressed={isSelected}
                data-selected={isSelected ? "true" : undefined}
                onClick={() => setSelectedProviderKey(provider.key)}
                disabled={isAuthenticating}
              >
                <div className="auth-school-list-item__logo-container">
                  <ProviderLogo provider={provider} alt={displayName} />
                </div>
                <div className="auth-school-list-item__content">
                  <h3 className="auth-school-list-item__title">{displayName}</h3>
                  {description && <p className="auth-school-list-item__desc">{description}</p>}
                </div>
              </button>
            );
          })}
        </div>

        {loading && (
          <div className="auth-school-list-status">
            <InlineLoading description={t("auth.campusSso.redirecting", "正在導向校園驗證頁面...")} />
          </div>
        )}

        {error && <p className="auth-error">{error}</p>}

        <div className="auth-actions auth-actions--desktop-submit auth-campus-sso-actions">
          <Button
            kind="secondary"
            type="button"
            className="auth-campus-sso-action-btn"
            onClick={handleBack}
            data-testid="auth-campus-sso-back"
          >
            {backLabel}
          </Button>
          <Button
            kind="primary"
            type="button"
            className="auth-campus-sso-action-btn"
            disabled={!selectedProvider || isAuthenticating}
            onClick={handleVerify}
            renderIcon={ArrowRight}
            data-testid="auth-campus-sso-submit"
          >
            {verifyLabel}
          </Button>
        </div>
      </div>

      <MobileActionFooter>
        <Button
          kind="secondary"
          size="2xl"
          type="button"
          onClick={handleBack}
          data-testid="auth-campus-sso-mobile-back"
        >
          {backLabel}
        </Button>
        <Button
          kind="primary"
          size="2xl"
          type="button"
          disabled={!selectedProvider || isAuthenticating}
          onClick={handleVerify}
          renderIcon={ArrowRight}
          data-testid="auth-campus-sso-mobile-submit"
        >
          {verifyLabel}
        </Button>
      </MobileActionFooter>
    </>
  );
};

export default CampusSsoScreen;
