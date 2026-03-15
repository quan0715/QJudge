import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useState, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Button, Grid, Column, Tag } from "@carbon/react";
import {
  ArrowRight,
  Chat,
  Login,
  Code,
  UserAvatar,
  UserMultiple,
  DocumentMultiple_01,
  Time,
  Security,
  Education,
  ChartLine,
  Result,
  Screen,
  Switcher,
  Cursor_1,
  Copy,
  CheckmarkFilled,
  Camera,
  Microphone,
  FaceActivated,
  Microscope,
  Home,
  Group,
  WatsonxAi,
  Folder,
  Light,
  Asleep,
  TaskComplete,
} from "@carbon/icons-react";
import { useTheme } from "@/shared/ui/theme/ThemeContext";
import LandingFeatureCard from "@/features/landing/components/LandingFeatureCard";
import AuthHeroComposition from "@/features/auth/components/AuthHeroComposition";
import LandingMiniJudgeSection from "@/features/landing/components/LandingMiniJudgeSection";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import { IconModeSwitcher, type IconModeOption } from '@/shared/ui/navigation/IconModeSwitcher';
import { TextModeSwitcher, type TextModeOption } from '@/shared/ui/navigation/TextModeSwitcher';
import { useContentLanguage } from '@/shared/contexts/ContentLanguageContext';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/i18n';
import "@carbon/charts-react/styles.css";
import "./LandingScreen.scss";

const themeOptions: IconModeOption<'light' | 'dark'>[] = [
  { value: 'light', label: 'Light', icon: Light },
  { value: 'dark', label: 'Dark', icon: Asleep },
];

// Reusable MacDots component
const MacDots = () => (
  <div className="landing-hero-ui__dots">
    <span className="landing-hero-ui__dot landing-hero-ui__dot--red" />
    <span className="landing-hero-ui__dot landing-hero-ui__dot--yellow" />
    <span className="landing-hero-ui__dot landing-hero-ui__dot--green" />
  </div>
);

const LandingScreen = () => {
  const navigate = useNavigate();
  const { t } = useTranslation(["landing", "common"]);
  const { theme, preference, setPreference } = useTheme();
  const { contentLanguage, setContentLanguage } = useContentLanguage();
  const [activeInteractive, setActiveInteractive] = useState("ai-create");
  
  const landingThemeClass = theme === "g100" || theme === "g90" ? "landing--dark" : "landing--light";

  const langOptions = useMemo<TextModeOption<SupportedLanguage>[]>(
    () =>
      SUPPORTED_LANGUAGES.map((lang) => ({
        value: lang.id,
        label: lang.label,
        shortLabel: lang.shortLabel,
      })),
    [],
  );

  const themeValue = preference === 'system' ? 'dark' : preference;

  const handleSignIn = () => navigate("/login");
  const handleDocs = () => navigate("/docs");

  const features = [
    {
      icon: <Code size={24} />,
      title: t("feature.judge.title", { defaultValue: "卓越的評測體驗" }),
      description: t("feature.judge.description", {
        defaultValue:
          "支援 20+ 種程式語言，秒級回傳執行時間與記憶體資訊，並提供精確的 Diff 比對與錯誤追蹤。",
      }),
      color: "primary" as const,
    },
    {
      icon: <DocumentMultiple_01 size={24} />,
      title: t("feature.paper.title", { defaultValue: "紙筆題型整合" }),
      description: t("feature.paper.description", {
        defaultValue:
          "整合選擇、是非、問答等紙筆題型，支援 LaTeX 數學公式與 Markdown 排版，一站式完成多元評量。",
      }),
      color: "magenta" as const,
    },
    {
      icon: <Security size={24} />,
      title: t("feature.antiCheat.title", { defaultValue: "嚴格的防作弊監控" }),
      description: t("feature.antiCheat.description", {
        defaultValue:
          "全螢幕強制鎖定、分頁切換偵測、視訊存證與 AI 違規分析，確保線上考試的絕對公平性。",
      }),
      color: "teal" as const,
    },
    {
      icon: <Education size={24} />,
      title: t("feature.teacher.title", { defaultValue: "更友善的教師系統" }),
      description: t("feature.teacher.description", {
        defaultValue:
          "直觀的批改面板、即時監考儀表板與詳細的成績統計，讓教師能將時間花在教學而非管理。",
      }),
      color: "purple" as const,
    },
  ];

  const interactiveItems = [
    { id: "ai-create", icon: <Code size={20} />, label: t("interactive.items.editor.label", { defaultValue: "AI 輔助出題" }), desc: t("interactive.items.editor.desc", { defaultValue: "AI 輔助各科考試題目建立與修改" }), img: "/illustrations/showcase-ai-create.png" },
    { id: "grading", icon: <Result size={20} />, label: t("interactive.items.grading.label", { defaultValue: "批改與分析" }), desc: t("interactive.items.grading.desc", { defaultValue: "考試結果批改與分析" }), img: "/illustrations/showcase-grading.png" },
    { id: "proctor", icon: <Security size={20} />, label: t("interactive.items.proctor.label", { defaultValue: "監考防弊" }), desc: t("interactive.items.proctor.desc", { defaultValue: "全方位監考防弊" }), img: "/illustrations/showcase-proctor.png" },
    { id: "exam-ui", icon: <Education size={20} />, label: t("interactive.items.stats.label", { defaultValue: "考試介面" }), desc: t("interactive.items.stats.desc", { defaultValue: "直觀、不失焦的考試作答畫面" }), img: "/illustrations/showcase-exam-ui.png" },
  ];

  const proctorGrid = [
    { icon: <Screen size={24} />, label: "全螢幕鎖定" },
    { icon: <Switcher size={24} />, label: "分頁切換偵測" },
    { icon: <UserMultiple size={24} />, label: "多螢幕封鎖" },
    { icon: <Cursor_1 size={24} />, label: "滑鼠離開軌跡" },
    { icon: <Copy size={24} />, label: "禁止複製貼上" },
    { icon: <Camera size={24} />, label: "視訊存證錄影" },
    { icon: <Microphone size={24} />, label: "音訊異常偵測" },
    { icon: <FaceActivated size={24} />, label: "人臉身分驗證" },
    { icon: <Security size={24} />, label: "AI 違規分析" },
  ];

  const contestModes = [
    { 
      id: "coding", 
      icon: <Code size={32} />, 
      label: t("modes.items.coding.label"), 
      desc: t("modes.items.coding.desc"),
      visual: (
        <div className="landing__mode-visual-box coding-test">
          <div className="editor-side">
            <div className="code-line w-90" />
            <div className="code-line w-70" />
            <div className="code-line indent code-line--highlight w-80" />
            <div className="code-line indent w-50" />
          </div>
          <div className="testcase-side">
            <header><CheckmarkFilled size={12}/> Testcase #1</header>
            <div className="tc-row">Input: 5</div>
            <div className="tc-row success">Output: 8</div>
          </div>
        </div>
      )
    },
    { 
      id: "paper", 
      icon: <DocumentMultiple_01 size={32} />, 
      label: t("modes.items.paper.label"), 
      desc: t("modes.items.paper.desc"),
      visual: (
        <div className="landing__mode-visual-box paper">
          <div className="paper-header-mock">
            <div className="info">Name: Student #102</div>
            <div className="timer"><Time size={12}/> 45:00</div>
          </div>
          <div className="paper-question-mock">
            <div className="q-label">Q1. LaTeX Rendering</div>
            <div className="q-math">
              <MarkdownRenderer enableMath>{"$$\\int_a^b f(x) dx$$"}</MarkdownRenderer>
            </div>
            <div className="q-options">
              <div className="opt active" />
              <div className="opt" />
              <div className="opt" />
            </div>
          </div>
        </div>
      )
    },
    { 
      id: "lab", 
      icon: <Microscope size={32} />, 
      label: t("modes.items.lab.label"), 
      desc: t("modes.items.lab.desc"),
      visual: (
        <div className="landing__mode-visual-box lab-practice">
          <div className="topic-header"><Folder size={14}/> Problem Topics</div>
          <div className="topic-list">
            <div className="topic-item">
              <span className="dot dot--green"/>
              <span className="name">Array & Strings</span>
              <span className="stat">12/15</span>
            </div>
            <div className="topic-item">
              <span className="dot dot--blue"/>
              <span className="name">Dynamic Programming</span>
              <span className="stat">4/20</span>
            </div>
          </div>
          <div className="practice-cta">Continue Practice</div>
        </div>
      )
    },
    { 
      id: "takehome", 
      icon: <Home size={32} />, 
      label: t("modes.items.takehome.label"), 
      desc: t("modes.items.takehome.desc"), 
      comingSoon: true,
      visual: (
        <div className="landing__mode-visual-box take-home">
          <div className="file-tree-mock">
            <div className="tree-item"><Folder size={14}/> src</div>
            <div className="tree-item indent"><Code size={14}/> main.py</div>
            <div className="tree-item"><Folder size={14}/> tests</div>
            <div className="tree-item"><DocumentMultiple_01 size={14}/> README.md</div>
          </div>
          <div className="project-badge">Project Mode</div>
        </div>
      )
    },
    { 
      id: "hackathon", 
      icon: <Group size={32} />, 
      label: t("modes.items.hackathon.label"), 
      desc: t("modes.items.hackathon.desc"), 
      comingSoon: true,
      visual: (
        <div className="landing__mode-visual-box hackathon">
          <div className="hack-teams">
            <div className="team-row">
              <span className="rank">1</span>
              <div className="team-progress"><div className="fill w-85"/></div>
            </div>
            <div className="team-row">
              <span className="rank">2</span>
              <div className="team-progress"><div className="fill w-70"/></div>
            </div>
          </div>
          <div className="live-tag">LIVE</div>
        </div>
      )
    },
    { 
      id: "adaptive", 
      icon: <WatsonxAi size={32} />, 
      label: t("modes.items.adaptive.label"), 
      desc: t("modes.items.adaptive.desc"), 
      comingSoon: true,
      visual: (
        <div className="landing__mode-visual-box adaptive">
          <div className="ai-path-nodes">
            <div className="node active"><WatsonxAi size={20}/></div>
            <div className="path-line" />
            <div className="node"><Code size={16}/></div>
            <div className="path-line" />
            <div className="node"><ChartLine size={16}/></div>
          </div>
          <div className="ai-status">Personalized Path</div>
        </div>
      )
    },
  ];

  const testimonials = [
    {
      quote: t("testimonials.quote1", {
        defaultValue: "即時回饋讓我能快速找出程式問題，比傳統作業效率高很多！",
      }),
      name: t("testimonials.name1", { defaultValue: "王同學" }),
      title: t("testimonials.title1", { defaultValue: "NYCU 資財系 大三" }),
    },
    {
      quote: t("testimonials.quote2", {
        defaultValue: "差異比較功能讓 debug 輕鬆許多，介面也很直覺。",
      }),
      name: t("testimonials.name2", { defaultValue: "李同學" }),
      title: t("testimonials.title2", { defaultValue: "NYCU 資財系 大二" }),
    },
    {
      quote: t("testimonials.quote3", {
        defaultValue: "Lab 模式與課程進度結合，加上討論功能，學習效果明顯提升。",
      }),
      name: t("testimonials.name3", { defaultValue: "陳同學" }),
      title: t("testimonials.title3", { defaultValue: "NYCU 資財系 大三" }),
    },
  ];

  const contactCards = [
    {
      icon: <Chat size={24} />,
      title: t("contact.email.title", { defaultValue: "電子郵件" }),
      value: "contact@qjudge.app",
      href: "mailto:contact@qjudge.app",
    },
    {
      icon: <Code size={24} />,
      title: t("contact.github.title", { defaultValue: "GitHub" }),
      value: "github.com/online-judge",
      href: "https://github.com/online-judge",
    },
    {
      icon: <UserMultiple size={24} />,
      title: t("contact.university.title", { defaultValue: "合作院校" }),
      value: t("contact.university.value", { defaultValue: "國立陽明交通大學" }),
      href: null,
    },
  ];

  return (
    <div className={`landing ${landingThemeClass}`}>
      <Helmet>
        <title>{t("seo.title", { defaultValue: "QJudge | 最安全穩定的線上考試平台" })}</title>
        <meta name="description" content={t("seo.description", { defaultValue: "QJudge 是一個專為教學現場設計的線上考試與評測平台，支援 20+ 種程式語言、多元題型整合、嚴格防作弊監控與 AI 輔助出題，提供最完善的數位評量體驗。" })} />
        <meta name="keywords" content="線上考試, 程式評測, Online Judge, 防作弊, 遠距教學, 程式教育, QJudge" />
        <link rel="canonical" href="https://qjudge.app/" />
        
        {/* JSON-LD Structured Data */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            "name": "QJudge",
            "operatingSystem": "Web",
            "applicationCategory": "EducationalApplication",
            "description": "QJudge 是一個專為教學現場設計的線上考試與評測平台，支援 20+ 種程式語言、多元題型整合、嚴格防作弊監控。",
            "offers": {
              "@type": "Offer",
              "price": "0",
              "priceCurrency": "TWD"
            },
            "aggregateRating": {
              "@type": "AggregateRating",
              "ratingValue": "4.8",
              "ratingCount": "120"
            }
          })}
        </script>
      </Helmet>
      <header className="landing__header">
        <div className="landing__header-inner">
          <div className="landing__header-logo" onClick={() => navigate("/")}>
            <TaskComplete size={20} className="landing__header-logo-icon" />
            <span className="landing__header-logo-text">QJudge</span>
          </div>
          <div className="landing__header-actions">
            <TextModeSwitcher
              value={contentLanguage}
              options={langOptions}
              onChange={setContentLanguage}
              ariaLabel={t("language.title", "語言")}
            />
            <IconModeSwitcher
              value={themeValue}
              options={themeOptions}
              onChange={setPreference}
              ariaLabel={t("theme.title", "主題")}
              tooltipPosition="bottom"
            />
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="landing__hero">
        <div className="landing__hero-content">
          <div className="landing__hero-text">
            <h1 className="landing__title">
              {t("hero.title", { defaultValue: "最安全穩定的線上考試平台" })}
            </h1>

            <p className="landing__subtitle">
              {t("hero.subtitle", {
                defaultValue:
                  "從出題、考試到分析，一站式完成",
              })}
            </p>

            <div className="landing__cta-row">
              <Button renderIcon={ArrowRight} onClick={handleSignIn} size="lg" kind="primary">
                {t("hero.signIn", { defaultValue: "開始體驗" })}
              </Button>
            </div>
          </div>

          <div className="landing__hero-visual">
            <div className="landing__hero-visual-panel landing__hero-visual-panel--exam">
              <AuthHeroComposition />
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Showcase Section */}
      <section className="landing__showcase">
        <div className="landing__showcase-header">
          <p className="landing__eyebrow">{t("interactive.eyebrow")}</p>
          <h2 className="landing__section-title">{t("interactive.title")}</h2>
        </div>

        <div className="landing__showcase-tabs">
          {interactiveItems.map((item) => (
            <button
              key={item.id}
              className={`landing__showcase-tab ${activeInteractive === item.id ? "landing__showcase-tab--active" : ""}`}
              onClick={() => setActiveInteractive(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="landing__showcase-desc">
          <p>{interactiveItems.find((i) => i.id === activeInteractive)?.desc}</p>
        </div>

        <div className="landing__showcase-frame">
          <div className="landing__showcase-titlebar">
            <MacDots />
            <span className="landing__showcase-titlebar-text">
              {interactiveItems.find((i) => i.id === activeInteractive)?.label}
            </span>
          </div>
          {(() => {
            const active = interactiveItems.find((i) => i.id === activeInteractive);
            return active ? (
              <img
                key={active.id}
                className="landing__showcase-img"
                src={active.img}
                alt={active.label}
                loading="lazy"
                decoding="async"
              />
            ) : null;
          })()}
        </div>
      </section>

      {/* Pillars Section */}
      <div className="landing__pillars">
        {/* Paper-like Exam */}
        <section className="landing__pillar">
          <Grid fullWidth className="landing__pillar-grid">
            <Column sm={4} md={4} lg={6}>
              <div className="landing__pillar-content">
                <p className="landing__eyebrow">{t("sections.paper.eyebrow", { defaultValue: "Paper-like Exam" })}</p>
                <h2 className="landing__pillar-title">{t("sections.paper.title")}</h2>
                <p className="landing__pillar-desc">{t("sections.paper.description")}</p>
                <div className="landing__pillar-tags">
                  <Tag type="cyan" size="md">{t("exam.tag1", { defaultValue: "LaTeX 支援" })}</Tag>
                  <Tag type="magenta" size="md">{t("exam.tag2", { defaultValue: "多樣題型" })}</Tag>
                </div>
              </div>
            </Column>
            <Column sm={4} md={4} lg={6}>
              <div className="landing-hero-ui__window landing__pillar-visual">
                <div className="landing-hero-ui__titlebar">
                  <MacDots />
                  <span className="landing-hero-ui__window-title">Mathematics Rendering</span>
                </div>
                <div className="landing-hero-ui__content landing__math-preview-content">
                  <div className="landing__math-preview-body">
                    <p className="landing__math-preview-text">{t("exam.preview_text")}</p>
                    <div className="landing__math-block">
                      <MarkdownRenderer enableMath>
                        {"$$\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}$$"}
                      </MarkdownRenderer>
                    </div>
                  </div>
                </div>
              </div>
            </Column>
          </Grid>
        </section>

        {/* Strict Proctoring */}
        <section className="landing__pillar landing__pillar--alt">
          <Grid fullWidth className="landing__pillar-grid">
            <Column sm={4} md={4} lg={6} className="landing__pillar-visual-col">
              <div className="landing__proctor-9grid">
                {proctorGrid.map((item, i) => (
                  <div key={i} className="landing__proctor-grid-item">
                    <div className="icon-wrapper">{item.icon}</div>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </Column>
            <Column sm={4} md={4} lg={6}>
              <div className="landing__pillar-content">
                <p className="landing__eyebrow">{t("sections.antiCheat.eyebrow", { defaultValue: "Strict Proctoring" })}</p>
                <h2 className="landing__pillar-title">{t("sections.antiCheat.title")}</h2>
                <p className="landing__pillar-desc">{t("sections.antiCheat.description")}</p>
                <div className="landing__pillar-tags">
                  <Tag type="teal" size="md">無需安裝軟體</Tag>
                  <Tag type="blue" size="md">全瀏覽器支援</Tag>
                </div>
              </div>
            </Column>
          </Grid>
        </section>
      </div>

      {/* Contest Modes Section */}
      <section className="landing__section landing__section--modes">
        <div className="landing__section-inner">
          <div className="landing__section-header landing__section-header--left">
            <p className="landing__eyebrow">{t("modes.eyebrow")}</p>
            <h2 className="landing__section-title">{t("modes.title")}</h2>
          </div>

          <div className="landing__modes-grid">
            {contestModes.map((mode) => (
              <div key={mode.id} className={`landing__mode-card ${mode.comingSoon ? "landing__mode-card--soon" : ""}`}>
                <div className="landing__mode-card-visual">
                  {mode.visual}
                </div>
                <div className="landing__mode-card-inner">
                  <div className="landing__mode-info">
                    <div className="landing__mode-header">
                      <h3>{mode.label}</h3>
                      {mode.comingSoon && <Tag size="sm" type="cool-gray">{t("modes.items." + mode.id + ".comingSoon", "Soon")}</Tag>}
                    </div>
                    <p>{mode.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <LandingMiniJudgeSection />

      {/* Grid Features */}
      <section className="landing__section landing__section--features">
        <div className="landing__section-inner">
          <div className="landing__section-header">
            <p className="landing__eyebrow">{t("features.eyebrow", { defaultValue: "核心價值" })}</p>
            <h2 className="landing__section-title">{t("features.title", { defaultValue: "專為教學現場設計的強大功能" })}</h2>
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

      {/* Testimonials */}
      <section className="landing__section landing__section--testimonials">
        <div className="landing__section-inner">
          <div className="landing__section-header">
            <p className="landing__eyebrow">{t("testimonials.eyebrow", { defaultValue: "使用者推薦" })}</p>
            <h2 className="landing__section-title">{t("testimonials.title", { defaultValue: "真實使用回饋" })}</h2>
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
                    <div className="testimonials-info">
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
              {t("testimonials.badge", {
                defaultValue: "National Yang Ming Chiao Tung University IM/Fin",
              })}
            </Tag>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="landing__section landing__section--contact">
        <div className="landing__section-inner">
          <Grid fullWidth>
            <Column sm={4} md={4} lg={7}>
              <div className="landing__contact-content">
                <p className="landing__eyebrow">{t("contact.eyebrow", { defaultValue: "聯絡我們" })}</p>
                <h2 className="landing__section-title">{t("contact.title", { defaultValue: "有任何問題或建議？" })}</h2>
                <p className="landing__contact-desc">{t("contact.description")}</p>
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
                        <a className="landing__contact-link" href={card.href}>{card.value}</a>
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

      {/* Final CTA */}
      <section className="landing__cta">
        <div className="landing__cta-inner">
          <h2 className="landing__cta-title">
            {t("cta.title", { defaultValue: "準備好開始了嗎？" })}
          </h2>
          <p className="landing__cta-text">
            {t("cta.description", {
              defaultValue: "立即加入 QJudge，體驗全新的線上測驗平台。完全免費，無需信用卡。",
            })}
          </p>
          <div className="landing__cta-actions">
            <Button renderIcon={Login} onClick={handleSignIn} size="lg">
              {t("cta.signIn", { defaultValue: "立即登入" })}
            </Button>
            <Button kind="secondary" onClick={handleDocs} size="lg" renderIcon={DocumentMultiple_01}>
              {t("cta.docs", { defaultValue: "了解更多" })}
            </Button>
          </div>
        </div>
      </section>

      <footer className="landing__footer">
        <p>
          {t("footer.copyright", {
            defaultValue: "© 2024 QJudge. Built with IBM Carbon Design System.",
          })}
        </p>
      </footer>
    </div>
  );
};

export default LandingScreen;
