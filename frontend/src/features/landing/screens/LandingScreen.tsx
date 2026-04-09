import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Helmet } from "react-helmet-async";
import { Asleep, Light } from "@carbon/icons-react";
import { getLandingContent } from "@/features/landing/content/landingContent";
import LandingHeader from "@/features/landing/sections/LandingHeader";
import HeroSection from "@/features/landing/sections/HeroSection";
import BentoFeaturesSection from "@/features/landing/sections/BentoFeaturesSection";
import FeatureDetailsSection from "@/features/landing/sections/FeatureDetailsSection";
import UsageFlowSection from "@/features/landing/sections/UsageFlowSection";
import AudienceSection from "@/features/landing/sections/AudienceSection";
import SocialProofSection from "@/features/landing/sections/SocialProofSection";
import PricingSection from "@/features/landing/sections/PricingSection";
import FaqSection from "@/features/landing/sections/FaqSection";
import FooterCtaSection from "@/features/landing/sections/FooterCtaSection";
import { useTheme } from "@/shared/ui/theme/ThemeContext";
import { useContentLanguage } from "@/shared/contexts/ContentLanguageContext";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/i18n";
import type { TextModeOption } from "@/shared/ui/navigation/TextModeSwitcher";
import type { IconModeOption } from "@/shared/ui/navigation/IconModeSwitcher";
import "@/features/landing/styles/LandingPage.scss";

const LandingScreen = () => {
  const navigate = useNavigate();
  const { t } = useTranslation("landing");
  const { preference, setPreference } = useTheme();
  const { contentLanguage, setContentLanguage } = useContentLanguage();
  const content = useMemo(() => getLandingContent(t), [t]);
  const languageOptions = useMemo<TextModeOption<SupportedLanguage>[]>(
    () =>
      SUPPORTED_LANGUAGES.map((lang) => ({
        value: lang.id,
        label: lang.label,
        shortLabel: lang.shortLabel,
      })),
    [],
  );
  const themeOptions: IconModeOption<"light" | "dark">[] = [
    { value: "light", label: "Light", icon: Light },
    { value: "dark", label: "Dark", icon: Asleep },
  ];
  const themeValue = preference === "system" ? "dark" : preference;

  const handleRegister = () => navigate("/register");
  const handleLogin = () => navigate("/login");
  const handlePricing = () => navigate("/pricing");
  const handleContact = () => {
    document.getElementById("landing-footer-cta")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="landing-page">
      <Helmet>
        <title>{t("seo.title")}</title>
        <meta name="description" content={t("seo.description")} />
        <meta name="keywords" content={t("seo.keywords")} />
        <link rel="canonical" href="https://qjudge.app/" />
      </Helmet>

      <LandingHeader
        items={content.nav}
        onLogin={handleLogin}
        languageValue={contentLanguage}
        languageOptions={languageOptions}
        onLanguageChange={setContentLanguage}
        themeValue={themeValue}
        themeOptions={themeOptions}
        onThemeChange={setPreference}
      />

      <main className="landing-page__main">
        <HeroSection content={content.hero} onPrimary={handleRegister} onSecondary={handleContact} />
        <BentoFeaturesSection
          eyebrow={t("bento.eyebrow")}
          title={t("bento.title")}
          description={t("bento.description")}
          cards={content.bento}
        />
        <FeatureDetailsSection
          eyebrow={t("details.eyebrow")}
          title={t("details.title")}
          description={t("details.description")}
          items={content.details}
        />
        <UsageFlowSection
          eyebrow={t("flow.eyebrow")}
          title={t("flow.title")}
          description={t("flow.description")}
          quickStartTitle={t("flow.quickStart.title")}
          flywheelTitle={t("flow.flywheel.title")}
          quickStart={content.quickStart}
          flywheel={content.flywheel}
        />
        <AudienceSection
          eyebrow={t("audience.eyebrow")}
          title={t("audience.title")}
          description={t("audience.description")}
          items={content.audiences}
        />
        <SocialProofSection
          eyebrow={t("socialProof.eyebrow")}
          title={t("socialProof.title")}
          description={t("socialProof.description")}
          metrics={content.metrics}
          caseStudies={content.caseStudies}
        />
        <PricingSection
          eyebrow={t("pricing.eyebrow")}
          title={t("pricing.title")}
          description={t("pricing.description")}
          cards={content.pricing}
          onRegister={handleRegister}
          onPricing={handlePricing}
          onContact={handleContact}
          disclaimer={t("pricing.disclaimer")}
        />
        <FaqSection
          eyebrow={t("faq.eyebrow")}
          title={t("faq.title")}
          description={t("faq.description")}
          items={content.faqs}
        />
      </main>

      <FooterCtaSection content={content.footer} />
    </div>
  );
};

export default LandingScreen;
