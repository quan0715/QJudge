import { useState } from "react";
import { InlineLoading } from "@carbon/react";
import { ArrowRight } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { AuthProviderOption } from "@/core/entities/auth.entity";
import { getOAuthUrl } from "@/infrastructure/api/repositories/auth.repository";
import { useAuthOptions } from "@/features/auth/hooks";
import { usePendingActions, PendingActionBanner } from "@/features/auth/pending-actions";
import { getProviderDescription, getProviderDisplayName } from "@/features/auth/utils/authProviderLabels";

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
  const { options } = useAuthOptions();
  // Auto-syncs query params (e.g. teacher_activation_token) → sessionStorage
  usePendingActions();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const campusProviders = options.providers.filter((provider) => provider.category === "campus");

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

  return (
    <>
      <div className="auth-form">
        <PendingActionBanner />
        <div className="auth-school-list">
          {campusProviders.map((provider) => {
            const displayName = getProviderDisplayName(t, provider);
            const description = getProviderDescription(t, provider);

            return (
              <button
                key={provider.key}
                type="button"
                className="auth-school-list-item"
                onClick={() => handleSsoLogin(provider.key)}
                disabled={loading !== null}
              >
                <div className="auth-school-list-item__logo-container">
                  <ProviderLogo provider={provider} alt={displayName} />
                </div>
                <div className="auth-school-list-item__content">
                  <h3 className="auth-school-list-item__title">{displayName}</h3>
                  {description && <p className="auth-school-list-item__desc">{description}</p>}
                </div>
                <ArrowRight size={20} className="auth-school-list-item__arrow" />
              </button>
            );
          })}
        </div>

        {loading && (
          <div style={{ marginTop: '2rem' }}>
            <InlineLoading description={t("auth.campusSso.redirecting", "正在導向校園驗證頁面...")} />
          </div>
        )}

        {error && <p className="auth-error">{error}</p>}
      </div>
    </>
  );
};

export default CampusSsoScreen;
