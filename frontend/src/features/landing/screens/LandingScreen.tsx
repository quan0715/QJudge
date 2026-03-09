import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Grid, Column, Tag } from "@carbon/react";
import {
  ArrowRight,
  Chat,
  Login,
  Code,
  UserAvatar,
  UserMultiple,
  MagicWand,
  DocumentMultiple_01,
} from "@carbon/icons-react";
import MatrixBackground from "@/features/auth/components/MatrixBackground";
import { useTheme } from "@/shared/ui/theme/ThemeContext";
import LandingFeatureCard from "@/features/landing/components/LandingFeatureCard";
import LandingHeroUiMock from "@/features/landing/components/LandingHeroUiMock";
import LandingMiniJudgeSection from "@/features/landing/components/LandingMiniJudgeSection";
import "./LandingScreen.scss";

const LandingScreen = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { theme } = useTheme();
  const matrixVariant = theme === "g100" || theme === "g90" ? "dark" : "light";
  const landingThemeClass = matrixVariant === "light" ? "landing--light" : "landing--dark";

  const handleSignIn = () => navigate("/login");
  const handleDocs = () => navigate("/docs");
  const handleRegister = () => navigate("/register");

  const heroSignals = [
    t("landing.hero.signal.realtime", { defaultValue: "Realtime Judge" }),
    t("landing.hero.signal.sandbox", { defaultValue: "Sandbox Execution" }),
    t("landing.hero.signal.report", { defaultValue: "Detailed Report" }),
  ];

  const features = [
    {
      icon: <Code size={24} />,
      title: t("landing.feature.judge.title", { defaultValue: "卓越的評測體驗" }),
      description: t("landing.feature.judge.description", {
        defaultValue:
          "支援 20+ 種程式語言，秒級回傳執行時間與記憶體資訊，並提供精確的 Diff 比對與錯誤追蹤。",
      }),
      color: "primary" as const,
    },
    {
      icon: <DocumentMultiple_01 size={24} />,
      title: t("landing.feature.paper.title", { defaultValue: "紙筆題型整合" }),
      description: t("landing.feature.paper.description", {
        defaultValue:
          "整合選擇、是非、問答等紙筆題型，支援 LaTeX 數學公式與 Markdown 排版，一站式完成多元評量。",
      }),
      color: "magenta" as const,
    },
    {
      icon: <UserMultiple size={24} />,
      title: t("landing.feature.antiCheat.title", { defaultValue: "嚴格的防作弊監控" }),
      description: t("landing.feature.antiCheat.description", {
        defaultValue:
          "全螢幕強制鎖定、分頁切換偵測、視訊存證與 AI 違規分析，確保線上考試的絕對公平性。",
      }),
      color: "teal" as const,
    },
    {
      icon: <MagicWand size={24} />,
      title: t("landing.feature.teacher.title", { defaultValue: "更友善的教師系統" }),
      description: t("landing.feature.teacher.description", {
        defaultValue:
          "直觀的批改面板、即時監考儀表板與詳細的成績統計，讓教師能將時間花在教學而非管理。",
      }),
      color: "purple" as const,
    },
  ];

  const testimonials = [
    {
      quote: t("landing.testimonials.quote1", {
        defaultValue: "即時回饋讓我能快速找出程式問題，比傳統作業效率高很多！",
      }),
      name: t("landing.testimonials.name1", { defaultValue: "王同學" }),
      title: t("landing.testimonials.title1", { defaultValue: "NYCU 資財系 大三" }),
    },
    {
      quote: t("landing.testimonials.quote2", {
        defaultValue: "差異比較功能讓 debug 輕鬆許多，介面也很直覺。",
      }),
      name: t("landing.testimonials.name2", { defaultValue: "李同學" }),
      title: t("landing.testimonials.title2", { defaultValue: "NYCU 資財系 大二" }),
    },
    {
      quote: t("landing.testimonials.quote3", {
        defaultValue: "Lab 模式與課程進度結合，加上討論功能，學習效果明顯提升。",
      }),
      name: t("landing.testimonials.name3", { defaultValue: "陳同學" }),
      title: t("landing.testimonials.title3", { defaultValue: "NYCU 資財系 大三" }),
    },
  ];

  const contactCards = [
    {
      icon: <Chat size={24} />,
      title: t("landing.contact.email.title", { defaultValue: "電子郵件" }),
      value: "contact@qjudge.app",
      href: "mailto:contact@qjudge.app",
    },
    {
      icon: <Code size={24} />,
      title: t("landing.contact.github.title", { defaultValue: "GitHub" }),
      value: "github.com/online-judge",
      href: "https://github.com/online-judge",
    },
    {
      icon: <UserMultiple size={24} />,
      title: t("landing.contact.university.title", { defaultValue: "合作院校" }),
      value: t("landing.contact.university.value", { defaultValue: "國立陽明交通大學" }),
      href: null,
    },
  ];

  return (
    <div className={`landing ${landingThemeClass}`}>
      <MatrixBackground variant={matrixVariant} />

      <section className="landing__hero">
        <div className="landing__hero-content">
          <div className="landing__hero-text">
            <div className="landing__badge-row">
              <Tag type="green" size="md">{t("landing.hero.badge.product", { defaultValue: "QJudge" })}</Tag>
              <Tag type="blue" size="md">{t("landing.hero.badge.tagline", { defaultValue: "Programming Assessment" })}</Tag>
            </div>

            <h1 className="landing__title">
              {t("landing.hero.title", { defaultValue: "QJudge - 程式測驗平台" })}
            </h1>

            <p className="landing__subtitle">
              {t("landing.hero.subtitle", {
                defaultValue:
                  "即時評測、考場防作弊、AI 助教輔助，讓教學與學習流程更順暢。",
              })}
            </p>

            <div className="landing__hero-signal-row">
              {heroSignals.map((signal) => (
                <span key={signal} className="landing__signal-pill">
                  {signal}
                </span>
              ))}
            </div>

            <div className="landing__cta-row">
              <Button renderIcon={Login} onClick={handleSignIn} size="lg" kind="primary">
                {t("landing.hero.signIn", { defaultValue: "立即登入" })}
              </Button>
              <Button renderIcon={ArrowRight} onClick={handleRegister} size="lg" kind="tertiary">
                {t("landing.hero.register", { defaultValue: "免費註冊" })}
              </Button>
            </div>
          </div>

          <div className="landing__hero-visual">
            <div className="landing__hero-visual-panel">
              <p className="landing__hero-visual-title">
                {t("landing.hero.visual.title", { defaultValue: "程式測驗流程" })}
              </p>
              <p className="landing__hero-visual-desc">
                {t("landing.hero.visual.desc", { defaultValue: "Code -> Judge -> Verdict" })}
              </p>
              <LandingHeroUiMock />
            </div>
          </div>
        </div>
      </section>

      <section className="landing__section landing__section--features">
        <div className="landing__section-inner">
          <div className="landing__section-header">
            <p className="landing__eyebrow">
              {t("landing.features.eyebrow", { defaultValue: "核心價值" })}
            </p>
            <h2 className="landing__section-title">
              {t("landing.features.title", { defaultValue: "專為教學現場設計的強大功能" })}
            </h2>
          </div>

          <Grid fullWidth className="landing__features-grid">
            {features.map((feature) => (
              <Column key={feature.title} sm={4} md={4} lg={4}>
                <LandingFeatureCard
                  icon={feature.icon}
                  title={feature.title}
                  description={feature.description}
                  color={feature.color}
                />
              </Column>
            ))}
          </Grid>
        </div>
      </section>

      <section className="landing__section landing__section--ai">
        <div className="landing__section-inner">
          <Grid fullWidth>
            <Column sm={4} md={4} lg={6}>
              <div className="landing__ai-content">
                <p className="landing__eyebrow">
                  {t("landing.exam.eyebrow", { defaultValue: "Exam V2" })}
                </p>
                <h2 className="landing__section-title">
                  {t("landing.exam.title", { defaultValue: "全方位的測驗體驗" })}
                </h2>
                <p className="landing__ai-desc">
                  {t("landing.exam.description", {
                    defaultValue:
                      "從程式開發到通識理論，QJudge 提供完整支援。內建 LaTeX 數學公式與 Markdown 編輯器，讓出題與作答同樣流暢。",
                  })}
                </p>
                <div className="landing__cta-row">
                  <Tag type="cyan" size="md">{t("landing.exam.tag1", { defaultValue: "LaTeX 支援" })}</Tag>
                  <Tag type="purple" size="md">{t("landing.exam.tag2", { defaultValue: "多樣題型" })}</Tag>
                  <Tag type="green" size="md">{t("landing.exam.tag3", { defaultValue: "自動批改" })}</Tag>
                </div>
              </div>
            </Column>
            <Column sm={4} md={4} lg={10}>
              <div className="landing-hero-ui__window" style={{ marginTop: "2rem" }}>
                <div className="landing-hero-ui__titlebar">
                  <span className="landing-hero-ui__window-title">Question Editor - Math Quiz</span>
                </div>
                <div className="landing-hero-ui__content" style={{ padding: "1.5rem" }}>
                  <div style={{ color: "var(--cds-text-primary)", fontSize: "0.9rem" }}>
                    <p style={{ marginBottom: "1rem" }}>{t("landing.exam.preview_text", { defaultValue: "請計算下列積分：" })}</p>
                    <div style={{ 
                      padding: "1rem", 
                      background: "var(--cds-layer-02)", 
                      borderRadius: "4px", 
                      textAlign: "center",
                      fontSize: "1.2rem",
                      marginBottom: "1rem",
                      border: "1px solid var(--cds-border-subtle-01)"
                    }}>
                      $$\int_{0}^{\infty} e^{-x^2} dx = \frac{\sqrt{\pi}}{2}$$
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} style={{ 
                          padding: "0.5rem 1rem", 
                          border: "1px solid var(--cds-border-subtle-01)",
                          borderRadius: "4px",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem"
                        }}>
                          <div style={{ width: "12px", height: "12px", borderRadius: "50%", border: "1px solid var(--cds-text-secondary)" }} />
                          <div style={{ width: "40%", height: "8px", background: "var(--cds-border-subtle-01)", borderRadius: "4px" }} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </Column>
          </Grid>
        </div>
      </section>

      <LandingMiniJudgeSection />

      <section className="landing__section landing__section--testimonials">
        <div className="landing__section-inner">
          <div className="landing__section-header">
            <p className="landing__eyebrow">
              {t("landing.testimonials.eyebrow", { defaultValue: "使用者推薦" })}
            </p>
            <h2 className="landing__section-title">
              {t("landing.testimonials.title", { defaultValue: "真實使用回饋" })}
            </h2>
          </div>

          <Grid fullWidth className="landing__testimonials-grid">
            {testimonials.map((item) => (
              <Column key={item.name} sm={4} md={4} lg={5}>
                <article className="landing__testimonial-card">
                  <div className="landing__testimonial-quote-icon">
                    <Chat size={24} />
                  </div>
                  <p className="landing__testimonial-text">"{item.quote}"</p>
                  <div className="landing__testimonial-author">
                    <span className="landing__testimonial-avatar">
                      <UserAvatar size={18} />
                    </span>
                    <div className="landing__testimonial-info">
                      <span className="landing__testimonial-name">{item.name}</span>
                      <span className="landing__testimonial-title">{item.title}</span>
                    </div>
                  </div>
                </article>
              </Column>
            ))}
          </Grid>

          <div className="landing__testimonials-badge">
            <Tag type="blue">
              {t("landing.testimonials.badge", {
                defaultValue: "National Yang Ming Chiao Tung University IM/Fin",
              })}
            </Tag>
          </div>
        </div>
      </section>

      <section className="landing__section landing__section--contact">
        <div className="landing__section-inner">
          <Grid fullWidth>
            <Column sm={4} md={4} lg={7}>
              <div className="landing__contact-content">
                <p className="landing__eyebrow">
                  {t("landing.contact.eyebrow", { defaultValue: "聯絡我們" })}
                </p>
                <h2 className="landing__section-title">
                  {t("landing.contact.title", { defaultValue: "有任何問題或建議？" })}
                </h2>
                <p className="landing__contact-desc">
                  {t("landing.contact.description", {
                    defaultValue:
                      "歡迎回饋、Bug 回報或合作洽談，透過以下方式與我們聯繫。",
                  })}
                </p>
              </div>
            </Column>
            <Column sm={4} md={4} lg={9}>
              <div className="landing__contact-cards">
                {contactCards.map((card) => (
                  <div key={card.title} className="landing__contact-card">
                    {card.icon}
                    <div className="landing__contact-card-content">
                      <h4>{card.title}</h4>
                      {card.href ? (
                        <a
                          className="landing__contact-link"
                          href={card.href}
                          target={card.href.startsWith("http") ? "_blank" : undefined}
                          rel={card.href.startsWith("http") ? "noreferrer noopener" : undefined}
                        >
                          {card.value}
                        </a>
                      ) : (
                        <span className="landing__contact-text">{card.value}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Column>
          </Grid>
        </div>
      </section>

      <section className="landing__cta">
        <div className="landing__cta-inner">
          <h2 className="landing__cta-title">
            {t("landing.cta.title", { defaultValue: "準備好開始了嗎？" })}
          </h2>
          <p className="landing__cta-text">
            {t("landing.cta.description", {
              defaultValue: "立即加入 QJudge，開始你的程式學習之旅。完全免費，無需信用卡。",
            })}
          </p>
          <div className="landing__cta-actions">
            <Button renderIcon={Login} onClick={handleSignIn} size="lg">
              {t("landing.cta.signIn", { defaultValue: "立即登入" })}
            </Button>
            <Button kind="secondary" onClick={handleDocs} size="lg" renderIcon={DocumentMultiple_01}>
              {t("landing.cta.docs", { defaultValue: "了解更多" })}
            </Button>
          </div>
        </div>
      </section>

      <footer className="landing__footer">
        <p>
          {t("landing.footer.copyright", {
            defaultValue: "© 2024 QJudge. Built with IBM Carbon Design System.",
          })}
        </p>
      </footer>
    </div>
  );
};

export default LandingScreen;
