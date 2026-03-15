import { useState } from "react";
import { InlineLoading } from "@carbon/react";
import { ArrowRight } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { getOAuthUrl } from "@/infrastructure/api/repositories/auth.repository";
import { useTheme } from "@/shared/ui/theme/ThemeContext";

const CAMPUS_PROVIDERS = [
  {
    id: "nycu",
    name: "NYCU 國立陽明交通大學",
    nameEn: "National Yang Ming Chiao Tung University",
    description: "使用校內 Portal 單一入口帳號進行身份驗證登入",
    logo: "/illustrations/nycu-logo.png",
    logoDark: "/illustrations/nycu-logo-white.png",
  },
];

const CampusSsoScreen = () => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  const isDark = theme === "g100" || theme === "g90";

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
        <div className="auth-school-list">
          {CAMPUS_PROVIDERS.map((provider) => (
            <button
              key={provider.id}
              type="button"
              className="auth-school-list-item"
              onClick={() => handleSsoLogin(provider.id)}
              disabled={loading !== null}
            >
              <div className="auth-school-list-item__logo-container">
                <img 
                  src={isDark && provider.logoDark ? provider.logoDark : provider.logo} 
                  alt={provider.name} 
                  className="auth-school-list-item__logo" 
                />
              </div>
              <div className="auth-school-list-item__content">
                <h3 className="auth-school-list-item__title">
                  {t(`auth.campusSso.providers.${provider.id}.name`, provider.name)}
                </h3>
                <p className="auth-school-list-item__desc">
                  {t(`auth.campusSso.providers.${provider.id}.description`, provider.description)}
                </p>
              </div>
              <ArrowRight size={20} className="auth-school-list-item__arrow" />
            </button>
          ))}
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
