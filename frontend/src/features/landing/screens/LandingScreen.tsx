import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useState, useMemo } from "react";
import { Button, Grid, Column, Tag, TextInput, TextArea } from "@carbon/react";
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
  WarningAlt,
  Play,
  Screen,
  Switcher,
  Cursor_1,
  Copy,
  Paste,
  CheckmarkFilled,
  Activity,
  UserFilled,
  Camera,
  Microphone,
  FaceActivated,
  Microscope,
  Home,
  Group,
  WatsonxAi,
  WarningFilled,
  Folder,
} from "@carbon/icons-react";
import MatrixBackground from "@/features/auth/components/MatrixBackground";
import { useTheme } from "@/shared/ui/theme/ThemeContext";
import LandingFeatureCard from "@/features/landing/components/LandingFeatureCard";
import LandingHeroUiMock from "@/features/landing/components/LandingHeroUiMock";
import LandingMiniJudgeSection from "@/features/landing/components/LandingMiniJudgeSection";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import { ThemeSwitch, LanguageSwitch, type ThemeValue } from "@/shared/ui/config";
import { AreaChart, DonutChart } from "@carbon/charts-react";
import "@carbon/charts-react/styles.css";
import "./LandingScreen.scss";

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
  const { t, i18n } = useTranslation(["landing", "common"]);
  const { theme, preference, setPreference } = useTheme();
  const [activeInteractive, setActiveInteractive] = useState("editor");
  
  const matrixVariant = theme === "g100" || theme === "g90" ? "dark" : "light";
  const landingThemeClass = matrixVariant === "light" ? "landing--light" : "landing--dark";
  const chartTheme = theme === "g100" || theme === "g90" ? theme : "g100";

  const handleSignIn = () => navigate("/login");
  const handleDocs = () => navigate("/docs");
  const handleRegister = () => navigate("/register");

  const handleLanguageSelect = (langId: string) => {
    i18n.changeLanguage(langId);
  };

  const handleThemeChange = (value: ThemeValue) => {
    setPreference(value);
  };

  const heroSignals = [
    t("hero.signal.realtime", { defaultValue: "即時評測" }),
    t("hero.signal.sandbox", { defaultValue: "沙盒執行" }),
    t("hero.signal.report", { defaultValue: "詳細報告" }),
  ];

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
    { id: "editor", icon: <Code size={20} />, label: t("interactive.items.editor.label"), desc: t("interactive.items.editor.desc") },
    { id: "proctor", icon: <Security size={20} />, label: t("interactive.items.proctor.label"), desc: t("interactive.items.proctor.desc") },
    { id: "grading", icon: <Result size={20} />, label: t("interactive.items.grading.label"), desc: t("interactive.items.grading.desc") },
    { id: "stats", icon: <ChartLine size={20} />, label: t("interactive.items.stats.label"), desc: t("interactive.items.stats.desc") },
  ];

  const donutData = useMemo(() => [
    { group: "A (90-100)", value: 25 },
    { group: "B (80-89)", value: 40 },
    { group: "C (70-79)", value: 20 },
    { group: "D (Below 70)", value: 15 },
  ], []);

  const areaData = useMemo(() => [
    { group: "Avg Score", date: "2024-03-01T00:00:00.000Z", value: 62 },
    { group: "Avg Score", date: "2024-03-02T00:00:00.000Z", value: 68 },
    { group: "Avg Score", date: "2024-03-03T00:00:00.000Z", value: 65 },
    { group: "Avg Score", date: "2024-03-04T00:00:00.000Z", value: 78 },
    { group: "Avg Score", date: "2024-03-05T00:00:00.000Z", value: 82 },
  ], []);

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
      <header className="landing__header">
        <div className="landing__header-inner">
          <div className="landing__header-logo" onClick={() => navigate("/")}>
            <span className="landing__header-logo-text">QJudge</span>
          </div>
          <div className="landing__header-actions">
            <LanguageSwitch
              value={i18n.language}
              onChange={handleLanguageSelect}
              size="sm"
              showLabel={false}
            />
            <ThemeSwitch
              value={preference}
              onChange={handleThemeChange}
              size="sm"
              showLabel={false}
            />
          </div>
        </div>
      </header>

      <MatrixBackground variant={matrixVariant} />

      {/* Hero Section */}
      <section className="landing__hero">
        <div className="landing__hero-content">
          <div className="landing__hero-text">
            <div className="landing__badge-row">
              <Tag type="green" size="md">{t("hero.badge.product", { defaultValue: "QJudge" })}</Tag>
              <Tag type="blue" size="md">{t("hero.badge.tagline", { defaultValue: "專業程式測驗平台" })}</Tag>
            </div>

            <h1 className="landing__title">
              {t("hero.title", { defaultValue: "QJudge，最安全穩定的線上考試平台" })}
            </h1>

            <p className="landing__subtitle">
              {t("hero.subtitle", {
                defaultValue:
                  "專為學術現場打造的高品質測驗環境。整合 AI 監考偵測、紙筆題型與即時評測，讓每一場考試都兼具公平、效率與深度。",
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
                {t("hero.signIn", { defaultValue: "立即登入" })}
              </Button>
              <Button renderIcon={ArrowRight} onClick={handleRegister} size="lg" kind="tertiary">
                {t("hero.register", { defaultValue: "免費註冊" })}
              </Button>
            </div>
          </div>

          <div className="landing__hero-visual">
            <div className="landing__hero-visual-panel">
              <p className="landing__hero-visual-title">
                {t("hero.visual.title", { defaultValue: "程式測驗流程" })}
              </p>
              <p className="landing__hero-visual-desc">
                {t("hero.visual.desc", { defaultValue: "Code -> Judge -> Verdict" })}
              </p>
              <LandingHeroUiMock />
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Showcase Section */}
      <section className="landing__section landing__section--interactive">
        <div className="landing__section-inner">
          <Grid fullWidth>
            <Column sm={4} md={4} lg={6}>
              <div className="landing__interactive-content">
                <p className="landing__eyebrow">{t("interactive.eyebrow")}</p>
                <h2 className="landing__section-title landing__section-title--left-spaced">
                  {t("interactive.title")}
                </h2>
                
                <div className="landing__interactive-list">
                  {interactiveItems.map((item) => (
                    <div 
                      key={item.id} 
                      className={`landing__interactive-item ${activeInteractive === item.id ? "landing__interactive-item--active" : ""}`}
                      onClick={() => setActiveInteractive(item.id)}
                    >
                      <div className="landing__interactive-item-header">
                        {item.icon}
                        <h3>{item.label}</h3>
                      </div>
                      {activeInteractive === item.id && (
                        <p className="landing__interactive-item-desc">{item.desc}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </Column>
            
            <Column sm={4} md={4} lg={10}>
              <div className="landing__interactive-visual-container">
                <div className="landing__interactive-visual-bg" />
                
                <div className="landing__interactive-visual-content">
                  {activeInteractive === "editor" && (
                    <div className="landing-hero-ui__window landing__precise-mock landing__precise-mock--fade-in">
                      <div className="landing-hero-ui__titlebar">
                        <MacDots />
                        <span className="landing-hero-ui__window-title">Supreme Editor - Markdown + LaTeX</span>
                      </div>
                      <div className="landing-hero-ui__content landing__mock-editor-grid">
                        <div className="landing__mock-editor-sidebar">
                          <header>Source Code</header>
                          <code className="landing__mock-code-src">
                            {"# Q1. Gaussian Integral\n\nCalculate the integral:\n\n$$\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}$$"}
                          </code>
                        </div>
                        <div className="landing__mock-editor-main">
                          <header className="landing__mock-preview-header">Live Preview (Printed Quality)</header>
                          <div className="landing__mock-editor-preview">
                            <MarkdownRenderer enableMath enableHighlight>
                              {"### Q1. 高斯積分計算\n\n請詳細寫出下列積分的推導過程：\n\n$$\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}$$\n\n**提示：** 可考慮使用極座標轉換 ($r, \\theta$)。"}
                            </MarkdownRenderer>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {activeInteractive === "proctor" && (
                    <div className="landing-hero-ui__window landing__precise-mock landing__mock-proctor-container landing__precise-mock--fade-in">
                      <div className="landing-hero-ui__titlebar">
                        <MacDots />
                        <span className="landing-hero-ui__window-title">Strict Proctoring Environment</span>
                      </div>
                      <div className="landing-hero-ui__content landing__mock-proctor-env">
                        <div className="landing__mock-proctor-editor-bg">
                          <div className="line w-40" />
                          <div className="line w-60" />
                          <div className="line w-30" />
                        </div>

                        <div className="landing__proctor-warning-overlay">
                          <div className="landing__proctor-warning-dialog">
                            <WarningAlt size={48} className="warning-icon" />
                            <h3>檢測到違規行為</h3>
                            <p>系統偵測到您試圖離開考場環境，此行為已被記錄並即時通知監考老師。</p>
                            <div className="warning-stats">
                              <span>違規次數：1/3</span>
                              <span>狀態：暫時鎖定</span>
                            </div>
                            <Button size="sm" kind="danger">重新進入全螢幕</Button>
                          </div>
                        </div>

                        <div className="landing__forbidden-icons">
                          <div className="forbidden-item forbidden-item--top-left">
                            <Screen size={32} />
                            <div className="slash" />
                            <span className="label">多螢幕偵測</span>
                          </div>
                          <div className="forbidden-item forbidden-item--top-right">
                            <Switcher size={32} />
                            <div className="slash" />
                            <span className="label">分頁切換</span>
                          </div>
                          <div className="forbidden-item forbidden-item--bottom-left">
                            <Cursor_1 size={32} />
                            <div className="slash" />
                            <span className="label">滑鼠離開</span>
                          </div>
                          <div className="forbidden-item forbidden-item--bottom-right">
                            <div className="copy-paste-group">
                              <Copy size={24} />
                              <Paste size={24} />
                            </div>
                            <div className="slash" />
                            <span className="label">複製貼上</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {activeInteractive === "grading" && (
                    <div className="landing-hero-ui__window landing__precise-mock landing__precise-mock--fade-in">
                      <div className="landing-hero-ui__titlebar">
                        <MacDots />
                        <span className="landing-hero-ui__window-title">High-Efficiency Grading Panel</span>
                      </div>
                      <div className="landing-hero-ui__content landing__mock-grading-grid">
                        <div className="landing__mock-grading-col landing__mock-grading-col--q">
                          <div className="header">Questions</div>
                          <div className="item success"><CheckmarkFilled size={14} /> Q1. Logic (Auto)</div>
                          <div className="item active"><Play size={14} /> Q2. Architecture</div>
                          <div className="item"><Play size={14} /> Q3. Analysis</div>
                        </div>
                        <div className="landing__mock-grading-col landing__mock-grading-col--ans">
                          <div className="header">Student Response</div>
                          <div className="ans-box">
                            <p><strong>Question:</strong> 簡述微服務架構的優缺點。</p>
                            <p><strong>Answer:</strong> 優點包含高擴充性、技術異質性與部署獨立性。缺點則是分散式系統帶來的複雜度...</p>
                          </div>
                        </div>
                        <div className="landing__mock-grading-col landing__mock-grading-col--score">
                          <div className="header">Grading Tool</div>
                          <div className="score-input-mock">
                            <TextInput id="score" labelText="Score" defaultValue="9" size="sm" />
                            <span className="max">/ 10</span>
                          </div>
                          <TextArea id="feedback" labelText="Feedback" defaultValue="非常完整的分析，優缺點並陳且邏輯清晰。" rows={3} />
                          <Button size="sm" kind="primary" className="landing__grading-next-btn">Next Student</Button>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {activeInteractive === "stats" && (
                    <div className="landing-hero-ui__window landing__precise-mock landing__precise-mock--fade-in">
                      <div className="landing-hero-ui__titlebar">
                        <MacDots />
                        <span className="landing-hero-ui__window-title">Intelligent Results Analysis</span>
                      </div>
                      <div className="landing-hero-ui__content landing__mock-stats-container">
                        <div className="landing__mock-stats-kpis">
                          <div className="kpi-card">
                            <UserFilled size={20} />
                            <div className="val">82.5</div>
                            <div className="lab">Class Average</div>
                          </div>
                          <div className="kpi-card danger">
                            <WarningFilled size={20} />
                            <div className="val">Q4</div>
                            <div className="lab">Hardest Question</div>
                          </div>
                          <div className="kpi-card success">
                            <Activity size={20} />
                            <div className="val">94%</div>
                            <div className="lab">Passing Rate</div>
                          </div>
                        </div>
                        <div className="landing__mock-stats-charts">
                          <div className="chart-item">
                            <DonutChart
                              data={donutData}
                              options={{
                                title: "Grade Distribution",
                                height: "180px",
                                theme: chartTheme,
                                donut: { center: { label: "Total" } },
                                toolbar: { enabled: false }
                              }}
                            />
                          </div>
                          <div className="chart-item">
                            <AreaChart
                              data={areaData}
                              options={{
                                title: "Score Growth Trend",
                                height: "180px",
                                theme: chartTheme,
                                axes: {
                                  bottom: { mapsTo: "date", scaleType: "time" as any },
                                  left: { mapsTo: "value", scaleType: "linear" as any }
                                },
                                toolbar: { enabled: false }
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Column>
          </Grid>
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
              defaultValue: "立即加入 QJudge，開始你的程式學習之旅. 完全免費，無需信用卡。",
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
