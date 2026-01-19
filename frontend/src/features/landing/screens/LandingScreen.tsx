import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Button,
  Grid,
  Column,
  Tag,
  Tile,
  Stack,
} from "@carbon/react";
import {
  ArrowRight,
  Login,
  Code,
  Terminal,
  ChartMultiLine,
  Notebook,
  Rocket,
  Time,
  CheckmarkFilled,
  DocumentMultiple_01,
  Trophy,
  UserMultiple,
  Email,
  LogoGithub,
  Education,
  Quotes,
} from "@carbon/icons-react";
import MatrixBackground from "@/features/auth/components/MatrixBackground";
import "./LandingScreen.scss";

/** 模擬的程式碼片段 - 展示平台的 Online Judge 特色 */
const codeSnippet = `def solve(n: int) -> int:
    """找出第 n 個費氏數"""
    if n <= 1:
        return n
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b

# 測試你的解法
print(solve(10))  # Output: 55`;

/** 模擬的終端輸出 */
const terminalOutput = `$ python solution.py
Running test cases...

✓ Test 1: solve(0) = 0 ........... PASSED
✓ Test 2: solve(1) = 1 ........... PASSED  
✓ Test 3: solve(10) = 55 ......... PASSED
✓ Test 4: solve(20) = 6765 ....... PASSED

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Result: 4/4 test cases passed
Status: ✓ Accepted
Time: 12ms | Memory: 3.2MB`;

const LandingScreen = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleSignIn = () => navigate("/login");
  const handleDocs = () => navigate("/docs");
  const handleRegister = () => navigate("/register");

  const features = [
    {
      icon: <Code size={24} />,
      title: t("landing.features.multiLanguage.title", { defaultValue: "多語言支援" }),
      description: t("landing.features.multiLanguage.description", {
        defaultValue: "支援 Python、C++、Java、JavaScript 等主流程式語言，即時編譯執行。",
      }),
      color: "primary",
    },
    {
      icon: <ChartMultiLine size={24} />,
      title: t("landing.features.analytics.title", { defaultValue: "即時分析" }),
      description: t("landing.features.analytics.description", {
        defaultValue: "詳細的測試結果、執行時間分析、記憶體使用統計，協助優化程式效能。",
      }),
      color: "purple",
    },
    {
      icon: <Trophy size={24} />,
      title: t("landing.features.contest.title", { defaultValue: "競賽系統" }),
      description: t("landing.features.contest.description", {
        defaultValue: "舉辦程式競賽、排行榜即時更新、支援多種計分模式與時間限制。",
      }),
      color: "teal",
    },
    {
      icon: <UserMultiple size={24} />,
      title: t("landing.features.lab.title", { defaultValue: "實驗室模式" }),
      description: t("landing.features.lab.description", {
        defaultValue: "為課程打造的 Lab 模式，教師可管理題目集、追蹤學生進度。",
      }),
      color: "magenta",
    },
  ];

  const steps = [
    {
      icon: <Notebook size={24} />,
      step: "01",
      title: t("landing.steps.browse.title", { defaultValue: "瀏覽題庫" }),
      description: t("landing.steps.browse.description", {
        defaultValue: "依難度、標籤篩選題目，查看題目說明與範例測資。",
      }),
    },
    {
      icon: <Terminal size={24} />,
      step: "02",
      title: t("landing.steps.code.title", { defaultValue: "撰寫程式" }),
      description: t("landing.steps.code.description", {
        defaultValue: "使用內建編輯器撰寫程式，支援語法高亮與自動補全。",
      }),
    },
    {
      icon: <Time size={24} />,
      step: "03",
      title: t("landing.steps.submit.title", { defaultValue: "提交評測" }),
      description: t("landing.steps.submit.description", {
        defaultValue: "一鍵提交，即時取得測試結果與詳細執行報告。",
      }),
    },
    {
      icon: <Rocket size={24} />,
      step: "04",
      title: t("landing.steps.improve.title", { defaultValue: "持續精進" }),
      description: t("landing.steps.improve.description", {
        defaultValue: "參與討論、查看他人解法、挑戰競賽提升實力。",
      }),
    },
  ];

  const stats = [
    { value: "500+", label: t("landing.stats.problems", { defaultValue: "程式題目" }) },
    { value: "10K+", label: t("landing.stats.submissions", { defaultValue: "提交次數" }) },
    { value: "1K+", label: t("landing.stats.users", { defaultValue: "活躍用戶" }) },
    { value: "99.9%", label: t("landing.stats.uptime", { defaultValue: "系統穩定度" }) },
  ];

  const testimonials = [
    {
      quote: t("landing.testimonials.quote1", {
        defaultValue:
          "QJudge 的即時回饋讓我能快速找出程式的問題，比起傳統作業繳交方式效率提升很多！",
      }),
      name: t("landing.testimonials.name1", { defaultValue: "王同學" }),
      title: t("landing.testimonials.title1", { defaultValue: "NYCU 資財系大三" }),
    },
    {
      quote: t("landing.testimonials.quote2", {
        defaultValue:
          "介面設計很直覺，測資的差異比較功能讓 debug 變得輕鬆許多，推薦給所有正在學程式的同學。",
      }),
      name: t("landing.testimonials.name2", { defaultValue: "李同學" }),
      title: t("landing.testimonials.title2", { defaultValue: "NYCU 資財系大二" }),
    },
    {
      quote: t("landing.testimonials.quote3", {
        defaultValue:
          "Lab 模式讓我們可以按照課程進度練習，搭配討論區的功能，學習效果比以前好很多。",
      }),
      name: t("landing.testimonials.name3", { defaultValue: "陳同學" }),
      title: t("landing.testimonials.title3", { defaultValue: "NYCU 資財系大三" }),
    },
  ];

  return (
    <div className="landing">
      <MatrixBackground />

      {/* Hero Section */}
      <section className="landing__hero">
        <div className="landing__hero-content">
          <div className="landing__hero-text">
            <div className="landing__badge-row">
              <Tag type="green" size="md">QJudge</Tag>
              <Tag type="blue" size="md">Online Judge</Tag>
            </div>

            <h1 className="landing__title">
              {t("landing.hero.title", { defaultValue: "程式評測，\n即刻開始" })}
            </h1>

            <p className="landing__subtitle">
              {t("landing.hero.subtitle", {
                defaultValue:
                  "QJudge 是一個現代化的線上程式評測系統，提供即時測試、競賽功能與完整的學習追蹤，讓你專注於提升程式能力。",
              })}
            </p>

            <div className="landing__cta-row">
              <Button
                renderIcon={Login}
                onClick={handleSignIn}
                size="lg"
                kind="primary"
              >
                {t("landing.hero.signIn", { defaultValue: "立即登入" })}
              </Button>
              <Button
                renderIcon={ArrowRight}
                onClick={handleRegister}
                size="lg"
                kind="tertiary"
              >
                {t("landing.hero.register", { defaultValue: "免費註冊" })}
              </Button>
            </div>

            <div className="landing__stats-row">
              {stats.map((stat, index) => (
                <div key={index} className="landing__stat">
                  <span className="landing__stat-value">{stat.value}</span>
                  <span className="landing__stat-label">{stat.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Code Preview */}
          <div className="landing__hero-visual">
            <div className="landing__code-window">
              <div className="landing__code-header">
                <div className="landing__code-dots">
                  <span className="landing__code-dot landing__code-dot--red" />
                  <span className="landing__code-dot landing__code-dot--yellow" />
                  <span className="landing__code-dot landing__code-dot--green" />
                </div>
                <span className="landing__code-filename">solution.py</span>
              </div>
              <pre className="landing__code-content">
                <code>{codeSnippet}</code>
              </pre>
            </div>

            <div className="landing__terminal-window">
              <div className="landing__terminal-header">
                <Terminal size={16} />
                <span>Terminal</span>
              </div>
              <pre className="landing__terminal-content">
                <code>{terminalOutput}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="landing__section landing__section--features">
        <div className="landing__section-inner">
          <div className="landing__section-header">
            <p className="landing__eyebrow">
              {t("landing.features.eyebrow", { defaultValue: "核心功能" })}
            </p>
            <h2 className="landing__section-title">
              {t("landing.features.title", { defaultValue: "為程式學習打造的完整平台" })}
            </h2>
          </div>

          <Grid fullWidth className="landing__features-grid">
            {features.map((feature, index) => (
              <Column key={index} sm={4} md={4} lg={4}>
                <Tile className="landing__feature-tile">
                  <Stack gap={4}>
                    <div className={`landing__feature-icon landing__feature-icon--${feature.color}`}>
                      {feature.icon}
                    </div>
                    <h3 className="landing__feature-title">{feature.title}</h3>
                    <p className="landing__feature-desc">{feature.description}</p>
                  </Stack>
                </Tile>
              </Column>
            ))}
          </Grid>
        </div>
      </section>

      {/* How it works Section */}
      <section className="landing__section landing__section--steps">
        <div className="landing__section-inner">
          <div className="landing__section-header">
            <p className="landing__eyebrow">
              {t("landing.steps.eyebrow", { defaultValue: "使用流程" })}
            </p>
            <h2 className="landing__section-title">
              {t("landing.steps.title", { defaultValue: "四步驟開始你的程式旅程" })}
            </h2>
          </div>

          <div className="landing__steps-grid">
            {steps.map((step, index) => (
              <div key={index} className="landing__step">
                <div className="landing__step-number">{step.step}</div>
                <div className="landing__step-icon">{step.icon}</div>
                <h4 className="landing__step-title">{step.title}</h4>
                <p className="landing__step-desc">{step.description}</p>
                {index < steps.length - 1 && (
                  <div className="landing__step-connector" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Highlights Section */}
      <section className="landing__section landing__section--highlights">
        <div className="landing__section-inner">
          <Grid fullWidth>
            <Column sm={4} md={4} lg={8}>
              <div className="landing__highlight-content">
                <p className="landing__eyebrow">
                  {t("landing.highlights.eyebrow", { defaultValue: "為什麼選擇 QJudge" })}
                </p>
                <h2 className="landing__section-title">
                  {t("landing.highlights.title", { defaultValue: "專為教學與競賽設計" })}
                </h2>
                <ul className="landing__highlight-list">
                  <li>
                    <CheckmarkFilled size={20} />
                    <span>{t("landing.highlights.item1", { defaultValue: "支援課程 Lab 模式，追蹤學生進度" })}</span>
                  </li>
                  <li>
                    <CheckmarkFilled size={20} />
                    <span>{t("landing.highlights.item2", { defaultValue: "即時競賽系統與排行榜" })}</span>
                  </li>
                  <li>
                    <CheckmarkFilled size={20} />
                    <span>{t("landing.highlights.item3", { defaultValue: "詳細的測試結果與差異比較" })}</span>
                  </li>
                  <li>
                    <CheckmarkFilled size={20} />
                    <span>{t("landing.highlights.item4", { defaultValue: "題目討論串與公告系統" })}</span>
                  </li>
                  <li>
                    <CheckmarkFilled size={20} />
                    <span>{t("landing.highlights.item5", { defaultValue: "基於 IBM Carbon 的現代化介面" })}</span>
                  </li>
                </ul>
                <Button
                  renderIcon={DocumentMultiple_01}
                  onClick={handleDocs}
                  kind="tertiary"
                  size="md"
                >
                  {t("landing.highlights.docs", { defaultValue: "查看文件" })}
                </Button>
              </div>
            </Column>
            <Column sm={4} md={4} lg={8}>
              <div className="landing__highlight-visual">
                <div className="landing__result-card">
                  <div className="landing__result-header">
                    <CheckmarkFilled size={24} className="landing__result-icon--success" />
                    <span className="landing__result-status">Accepted</span>
                  </div>
                  <div className="landing__result-details">
                    <div className="landing__result-item">
                      <span className="landing__result-label">Runtime</span>
                      <span className="landing__result-value">12 ms</span>
                    </div>
                    <div className="landing__result-item">
                      <span className="landing__result-label">Memory</span>
                      <span className="landing__result-value">3.2 MB</span>
                    </div>
                    <div className="landing__result-item">
                      <span className="landing__result-label">Test Cases</span>
                      <span className="landing__result-value">4/4</span>
                    </div>
                  </div>
                  <div className="landing__result-progress">
                    <div className="landing__result-progress-bar" />
                  </div>
                </div>
              </div>
            </Column>
          </Grid>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="landing__section landing__section--testimonials">
        <div className="landing__section-inner">
          <div className="landing__section-header">
            <p className="landing__eyebrow">
              {t("landing.testimonials.eyebrow", { defaultValue: "用戶回饋" })}
            </p>
            <h2 className="landing__section-title">
              {t("landing.testimonials.title", { defaultValue: "聽聽同學們怎麼說" })}
            </h2>
          </div>

          <Grid fullWidth className="landing__testimonials-grid">
            {testimonials.map((testimonial, index) => (
              <Column key={index} sm={4} md={4} lg={5}>
                <Tile className="landing__testimonial-card">
                  <Quotes size={32} className="landing__testimonial-quote-icon" />
                  <p className="landing__testimonial-text">{testimonial.quote}</p>
                  <div className="landing__testimonial-author">
                    <div className="landing__testimonial-avatar">
                      <Education size={20} />
                    </div>
                    <div className="landing__testimonial-info">
                      <span className="landing__testimonial-name">{testimonial.name}</span>
                      <span className="landing__testimonial-title">{testimonial.title}</span>
                    </div>
                  </div>
                </Tile>
              </Column>
            ))}
          </Grid>

          <div className="landing__testimonials-badge">
            <Tag type="blue" size="md">
              <Education size={16} style={{ marginRight: "0.5rem" }} />
              {t("landing.testimonials.badge", { defaultValue: "國立陽明交通大學 資訊管理與財務金融學系" })}
            </Tag>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="landing__section landing__section--contact">
        <div className="landing__section-inner">
          <Grid fullWidth>
            <Column sm={4} md={4} lg={8}>
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
                      "我們歡迎任何回饋與建議，無論是功能需求、Bug 回報或是合作洽談，都歡迎透過以下方式聯繫我們。",
                  })}
                </p>
              </div>
            </Column>
            <Column sm={4} md={4} lg={8}>
              <div className="landing__contact-cards">
                <Tile className="landing__contact-card">
                  <Email size={24} />
                  <div className="landing__contact-card-content">
                    <h4>{t("landing.contact.email.title", { defaultValue: "電子郵件" })}</h4>
                    <a href="mailto:support@qjudge.dev" className="landing__contact-link">
                      support@qjudge.dev
                    </a>
                  </div>
                </Tile>
                <Tile className="landing__contact-card">
                  <LogoGithub size={24} />
                  <div className="landing__contact-card-content">
                    <h4>{t("landing.contact.github.title", { defaultValue: "GitHub" })}</h4>
                    <a
                      href="https://github.com/qjudge"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="landing__contact-link"
                    >
                      github.com/qjudge
                    </a>
                  </div>
                </Tile>
                <Tile className="landing__contact-card">
                  <Education size={24} />
                  <div className="landing__contact-card-content">
                    <h4>{t("landing.contact.university.title", { defaultValue: "合作院校" })}</h4>
                    <span className="landing__contact-text">
                      {t("landing.contact.university.value", { defaultValue: "國立陽明交通大學" })}
                    </span>
                  </div>
                </Tile>
              </div>
            </Column>
          </Grid>
        </div>
      </section>

      {/* CTA Section */}
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
            <Button kind="secondary" onClick={handleDocs} size="lg">
              {t("landing.cta.docs", { defaultValue: "了解更多" })}
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
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
