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
      title: t("landing.feature.judge.title", { defaultValue: "良好的測驗體驗" }),
      description: t("landing.feature.judge.description", {
        defaultValue:
          "提交後即時回傳測資結果、執行時間與記憶體資訊，並提供清楚的除錯脈絡。",
      }),
      color: "primary" as const,
    },
    {
      icon: <UserMultiple size={24} />,
      title: t("landing.feature.antiCheat.title", { defaultValue: "防作弊系統" }),
      description: t("landing.feature.antiCheat.description", {
        defaultValue:
          "考場模式支援違規事件記錄、狀態鎖定與管理端追蹤，維持公平的程式測驗流程。",
      }),
      color: "teal" as const,
    },
    {
      icon: <MagicWand size={24} />,
      title: t("landing.feature.ai.title", { defaultValue: "AI 助教出題輔助" }),
      description: t("landing.feature.ai.description", {
        defaultValue:
          "協助教師整理題意、產生題目草稿與教學內容，讓課程準備更快且品質一致。",
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
              <Tag type="green" size="md">QJudge</Tag>
              <Tag type="blue" size="md">Programming Assessment</Tag>
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
              {t("landing.features.eyebrow", { defaultValue: "核心功能" })}
            </p>
            <h2 className="landing__section-title">
              {t("landing.features.title", { defaultValue: "讓程式測驗與教學更順暢" })}
            </h2>
          </div>

          <Grid fullWidth className="landing__features-grid">
            {features.map((feature) => (
              <Column key={feature.title} sm={4} md={4} lg={5}>
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
