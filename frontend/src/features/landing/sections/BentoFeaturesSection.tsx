import type { FC } from "react";
import { Tile } from "@carbon/react";
import SectionHeading from "@/features/landing/components/SectionHeading";
import "./BentoFeaturesSection.scss";

interface BentoFeaturesSectionProps {
  eyebrow: string;
  title: string;
  description: string;
  cards: Array<{
    eyebrow: string;
    title: string;
    description: string;
    variant: "half" | "third";
    preview: "multiExam" | "proctoring" | "questionBank" | "ai" | "analytics";
  }>;
}

const MultiExamMock = () => (
  <div className="landing-bento-section__mock landing-bento-section__mock--exam" aria-hidden="true">
    <div className="landing-bento-section__mock-toolbar">
      <span>期末測驗</span>
      <span>剩餘 42:18</span>
    </div>
    <div className="landing-bento-section__exam-layout">
      <div className="landing-bento-section__question-card">
        <div className="landing-bento-section__mock-label">單選題</div>
        <strong>哪一個選項符合題目條件？</strong>
        <div className="landing-bento-section__choice is-selected">A. 正確答案</div>
        <div className="landing-bento-section__choice">B. 干擾選項</div>
        <div className="landing-bento-section__choice">C. 干擾選項</div>
      </div>
      <div className="landing-bento-section__code-panel">
        <div className="landing-bento-section__code-tabs">
          <span>main.py</span>
          <span>judge</span>
        </div>
        <div className="landing-bento-section__code-lines">
          <span className="w-90" />
          <span className="w-70" />
          <span className="w-82" />
          <span className="w-55" />
        </div>
      </div>
    </div>
  </div>
);

const ProctoringMock = () => (
  <div className="landing-bento-section__mock landing-bento-section__mock--proctoring" aria-hidden="true">
    <div className="landing-bento-section__mock-toolbar">
      <span>監考事件</span>
      <span className="landing-bento-section__status-tag">風險中</span>
    </div>
    <div className="landing-bento-section__event-list">
      {["視窗切換", "閒置過久", "裝置變更"].map((label, index) => (
        <div key={label} className="landing-bento-section__event-row">
          <span>{`0${index + 1}`}</span>
          <strong>{label}</strong>
          <small>{index === 0 ? "需複核" : "已記錄"}</small>
        </div>
      ))}
    </div>
    <div className="landing-bento-section__risk-line">
      <span />
    </div>
  </div>
);

const QuestionBankMock = () => (
  <div className="landing-bento-section__mock landing-bento-section__mock--bank" aria-hidden="true">
    <div className="landing-bento-section__mock-toolbar">
      <span>個人題庫</span>
      <span>128 題</span>
    </div>
    <div className="landing-bento-section__bank-layout">
      <div className="landing-bento-section__filter-list">
        <span className="is-active">資料結構</span>
        <span>基礎數學</span>
        <span>英文閱讀</span>
      </div>
      <div className="landing-bento-section__table-lines">
        {["選擇題", "Coding", "問答題", "填空題"].map((type) => (
          <div key={type}>
            <strong>{type}</strong>
            <span />
          </div>
        ))}
      </div>
    </div>
  </div>
);

const AiMock = () => (
  <div className="landing-bento-section__mock landing-bento-section__mock--ai" aria-hidden="true">
    <div className="landing-bento-section__chat-bubble landing-bento-section__chat-bubble--user">
      <span>教師</span>
      <p>幫我建立一題河內塔的遞迴練習題目，適合高中到大一程度。</p>
    </div>
    <div className="landing-bento-section__chat-bubble landing-bento-section__chat-bubble--ai">
      <span>QJudge AI</span>
      <p>題目草稿：給定 n 個圓盤，請輸出將河內塔從 A 移到 C 的最少步數，並說明遞迴關係。</p>
      <small>題型：Coding + 問答題</small>
    </div>
  </div>
);

const AnalyticsMock = () => (
  <div className="landing-bento-section__mock landing-bento-section__mock--analytics" aria-hidden="true">
    <div className="landing-bento-section__mock-toolbar">
      <span>考後分析</span>
      <span>完成率 94%</span>
    </div>
    <div className="landing-bento-section__chart-grid">
      {[72, 56, 84, 41].map((value, index) => (
        <div key={value} className="landing-bento-section__bar-row">
          <span>{`Q${index + 1}`}</span>
          <div>
            <i style={{ width: `${value}%` }} />
          </div>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  </div>
);

const BentoVisual = ({
  preview,
}: {
  preview: BentoFeaturesSectionProps["cards"][number]["preview"];
}) => {
  const mockByPreview = {
    multiExam: <MultiExamMock />,
    proctoring: <ProctoringMock />,
    questionBank: <QuestionBankMock />,
    ai: <AiMock />,
    analytics: <AnalyticsMock />,
  }[preview];

  return (
    <div className={`landing-bento-section__visual landing-bento-section__visual--${preview}`}>
      {mockByPreview}
    </div>
  );
};

const BentoFeaturesSection: FC<BentoFeaturesSectionProps> = ({ eyebrow, title, description, cards }) => {
  return (
    <section id="landing-features" className="landing-bento-section landing-section" data-testid="landing-section-features">
      <div className="landing-section__inner">
        <SectionHeading eyebrow={eyebrow} title={title} description={description} align="center" />

        <div className="landing-bento-section__grid">
          {cards.map((card) => (
            <Tile
              key={card.title}
              className={`landing-bento-section__card landing-bento-section__card--${card.variant}`}
            >
              <div className="landing-bento-section__content">
                <p className="landing-bento-section__card-eyebrow">{card.eyebrow}</p>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
              </div>
              <BentoVisual preview={card.preview} />
            </Tile>
          ))}
        </div>
      </div>
    </section>
  );
};

export default BentoFeaturesSection;
