import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Helmet } from "react-helmet-async";
import { Asleep, Light } from "@carbon/icons-react";
import { getLandingContent } from "@/features/landing/content/landingContent";
import LandingHeader from "@/features/landing/sections/LandingHeader";
import HeroSection from "@/features/landing/sections/HeroSection";
import ProductPropositionSection from "@/features/landing/sections/ProductPropositionSection";
import UsageFlowSection from "@/features/landing/sections/UsageFlowSection";
import AudienceSection from "@/features/landing/sections/AudienceSection";
import SocialProofSection from "@/features/landing/sections/SocialProofSection";
import FaqSection from "@/features/landing/sections/FaqSection";
import FooterCtaSection from "@/features/landing/sections/FooterCtaSection";
import MCPCollaborationSection from "@/features/landing/sections/MCPCollaborationSection";
import { useTheme } from "@/shared/ui/theme/ThemeContext";
import { useContentLanguage } from "@/shared/contexts/ContentLanguageContext";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/i18n";
import type { TextModeOption } from "@/shared/ui/navigation/TextModeSwitcher";
import type { IconModeOption } from "@/shared/ui/navigation/IconModeSwitcher";
import "@/features/landing/styles/LandingPage.scss";

const DEMO_FORM_URL = "https://bedecked-griffin-98f.notion.site/b532286e832b4846a8f08298b6942fcc?pvs=105";

const LandingScreen = () => {
  const navigate = useNavigate();
  const { t } = useTranslation("landing");
  const { preference, setPreference } = useTheme();
  const { contentLanguage, setContentLanguage } = useContentLanguage();
  const content = useMemo(() => getLandingContent(t), [t, contentLanguage]);

  const htmlLang = contentLanguage === "zh-TW" ? "zh-TW"
    : contentLanguage === "ja" ? "ja"
    : contentLanguage === "ko" ? "ko"
    : "en";

  const ogLocale = contentLanguage === "zh-TW" ? "zh_TW"
    : contentLanguage === "ja" ? "ja_JP"
    : contentLanguage === "ko" ? "ko_KR"
    : "en_US";

  const faqJsonLd = useMemo(() => ({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": content.faqs.map((item) => ({
      "@type": "Question",
      "name": item.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": item.answer,
      },
    })),
  }), [content.faqs]);

  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "QJudge",
    "applicationCategory": "EducationalApplication",
    "operatingSystem": "Web",
    "url": "https://qjudge.app/",
    "description": t("seo.description"),
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "TWD",
      "availability": "https://schema.org/InStock",
    },
    "featureList": [
      "線上考試", "AI 出題", "Coding 上機考", "防作弊監控", "題庫管理", "自動批改"
    ],
    "publisher": {
      "@type": "Organization",
      "@id": "https://qjudge.app/#organization",
      "name": "QJudge",
    },
  };

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
  const handleContact = () => {
    window.open(DEMO_FORM_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="landing-page">
      <Helmet>
        <html lang={htmlLang} />
        <title>{t("seo.title")}</title>
        <meta name="description" content={t("seo.description")} />
        <meta name="keywords" content={t("seo.keywords")} />
        <link rel="canonical" href="https://qjudge.app/" />
        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://qjudge.app/" />
        <meta property="og:site_name" content="QJudge" />
        <meta property="og:title" content={t("seo.ogTitle")} />
        <meta property="og:description" content={t("seo.ogDescription")} />
        <meta property="og:image" content="https://qjudge.app/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:locale" content={ogLocale} />
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={t("seo.ogTitle")} />
        <meta name="twitter:description" content={t("seo.ogDescription")} />
        <meta name="twitter:image" content="https://qjudge.app/og-image.png" />
        {/* JSON-LD */}
        <script type="application/ld+json">{JSON.stringify(softwareJsonLd)}</script>
        <script type="application/ld+json">{JSON.stringify(faqJsonLd)}</script>
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
        <ProductPropositionSection
          eyebrow={t("proposition.eyebrow")}
          title={t("proposition.title")}
          description={t("proposition.description")}
          items={content.proposition}
        />
        <MCPCollaborationSection content={content.mcp} />
        <UsageFlowSection
          eyebrow={t("flow.eyebrow")}
          title={t("flow.title")}
          description={t("flow.description")}
          items={content.workflow}
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
          caseStudies={content.caseStudies}
        />
        <FaqSection
          eyebrow={t("faq.eyebrow")}
          title={t("faq.title")}
          description={t("faq.description")}
          items={content.faqs}
        />
      </main>

      <FooterCtaSection content={content.footer} onPrimary={handleRegister} onSecondary={handleContact} />
    </div>
  );
};

export default LandingScreen;
