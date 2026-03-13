import { useState } from "react";
import { InlineLoading } from "@carbon/react";
import { ArrowRight, ArrowLeft } from "@carbon/icons-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getOAuthUrl } from "@/infrastructure/api/repositories/auth.repository";

const CAMPUS_PROVIDERS = [
  {
    id: "nycu",
    name: "國立陽明交通大學",
    nameEn: "National Yang Ming Chiao Tung University",
    logo: "/illustrations/nycu-logo.png",
  },
];

const CampusSsoScreen = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

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
      <Link to="/login" className="auth-back-link">
        <ArrowLeft size={16} />
        {t("auth.campusSso.backToLogin", "返回登入")}
      </Link>

      <div className="auth-header">
        <h1 className="auth-title">
          {t("auth.campusSso.title", "校園身份驗證")}
        </h1>
        <p className="auth-subtitle">
          {t("auth.campusSso.subtitle", "選擇您的學校進行身份驗證登入")}
        </p>
      </div>

      <div className="auth-form">
        <div className="auth-oauth-group">
          {CAMPUS_PROVIDERS.map((provider) => (
            <button
              key={provider.id}
              type="button"
              className="auth-oauth-btn auth-oauth-btn--sso"
              onClick={() => handleSsoLogin(provider.id)}
              disabled={loading !== null}
            >
              <img src={provider.logo} alt="" width={28} height={28} className="auth-oauth-btn__icon" />
              <span className="auth-oauth-btn__label">{provider.name}</span>
              <ArrowRight size={20} className="auth-oauth-btn__arrow" />
            </button>
          ))}
        </div>

        {loading && (
          <InlineLoading description={t("auth.campusSso.redirecting", "正在導向校園驗證頁面...")} />
        )}

        {error && <p className="auth-error">{error}</p>}
      </div>
    </>
  );
};

export default CampusSsoScreen;
