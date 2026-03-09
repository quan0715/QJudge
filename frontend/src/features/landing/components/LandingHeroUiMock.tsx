import {
  Checkmark,
  Code,
  UserMultiple,
  View,
  Locked,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";

const LandingHeroUiMock = () => {
  const { t } = useTranslation();
  
  return (
    <div className="landing-hero-ui" aria-hidden="true">
      <div className="landing-hero-ui__window">
        <div className="landing-hero-ui__titlebar">
          <span className="landing-hero-ui__dot landing-hero-ui__dot--red" />
          <span className="landing-hero-ui__dot landing-hero-ui__dot--yellow" />
          <span className="landing-hero-ui__dot landing-hero-ui__dot--green" />
          <span className="landing-hero-ui__window-title">Exam Session #A102 - Midterm</span>
        </div>

        <div className="landing-hero-ui__content">
          <section className="landing-hero-ui__editor">
            <header className="landing-hero-ui__panel-header">
              <Code size={16} />
              <span>solution.py</span>
            </header>

            <div className="landing-hero-ui__code-lines">
              <span className="w-78" />
              <span className="w-66" />
              <span className="w-84" />
              <span className="w-58" />
              <span className="w-73" />
              <span className="w-52" />
              <span className="w-40" />
            </div>
          </section>

          <section className="landing-hero-ui__status">
            <header className="landing-hero-ui__panel-header">
              <View size={16} />
              <span>{t("landing.hero.visual.proctoring", { defaultValue: "監考狀態" })}</span>
            </header>

            <div className="landing-hero-ui__status-list">
              <div className="landing-hero-ui__status-item">
                <Checkmark size={16} />
                <span>{t("landing.hero.visual.fullscreen", { defaultValue: "全螢幕模式" })}</span>
                <em>ON</em>
              </div>
              <div className="landing-hero-ui__status-item">
                <UserMultiple size={16} />
                <span>{t("landing.hero.visual.ai_monitoring", { defaultValue: "AI 違規偵測" })}</span>
                <em>Active</em>
              </div>
              <div className="landing-hero-ui__status-item">
                <View size={16} />
                <span>{t("landing.hero.visual.proctoring_video", { defaultValue: "視訊監控" })}</span>
                <em>Recording</em>
              </div>
              <div className="landing-hero-ui__status-item">
                <Locked size={16} />
                <span>{t("landing.hero.visual.violations", { defaultValue: "違規次數" })}</span>
                <em className="landing-hero-ui__violation-count">0</em>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default LandingHeroUiMock;
