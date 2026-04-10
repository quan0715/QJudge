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
    <div className="landing-bento-section__exam-layout">
      <div className="landing-bento-section__question-card">
        <div className="landing-bento-section__question-meta">
          <span className="landing-bento-section__mock-label">單選題</span>
          <em>2 pts</em>
        </div>
        <strong>哪一個選項符合遞迴的定義？</strong>
        <div className="landing-bento-section__choice is-selected">A. 函式直接或間接呼叫自身</div>
        <div className="landing-bento-section__choice">B. 使用迴圈重複執行</div>
        <div className="landing-bento-section__choice">C. 設定全域變數</div>
      </div>
      <div className="landing-bento-section__code-panel">
        <div className="landing-bento-section__code-tabs">
          <span className="is-active">main.py</span>
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

const PROCTOR_EVENTS = [
  { label: "視窗切換", count: "3 次", status: "需複核", warn: true },
  { label: "閒置過久", count: "1 次", status: "已記錄", warn: false },
  { label: "裝置變更", count: "1 次", status: "已記錄", warn: false },
] as const;

const ProctoringMock = () => (
  <div className="landing-bento-section__mock landing-bento-section__mock--proctoring" aria-hidden="true">
    <div className="landing-bento-section__event-header">
      <span>監考事件</span>
      <span className="landing-bento-section__status-tag">風險中</span>
    </div>
    <div className="landing-bento-section__event-list">
      {PROCTOR_EVENTS.map(({ label, count, status, warn }, index) => (
        <div key={label} className="landing-bento-section__event-row">
          <span className="landing-bento-section__event-index">{`0${index + 1}`}</span>
          <strong>{label}</strong>
          <em>{count}</em>
          <small className={warn ? "is-warn" : ""}>{status}</small>
        </div>
      ))}
    </div>
    <div className="landing-bento-section__risk-line">
      <span />
    </div>
  </div>
);

const BANK_CATEGORIES = [
  { label: "資料結構", active: true },
  { label: "基礎數學", active: false },
  { label: "英文閱讀", active: false },
] as const;

const BANK_TYPES = [
  { type: "選擇題", count: "58" },
  { type: "Coding", count: "32" },
  { type: "問答題", count: "24" },
  { type: "填空題", count: "14" },
] as const;

const QuestionBankMock = () => (
  <div className="landing-bento-section__mock landing-bento-section__mock--bank" aria-hidden="true">
    <div className="landing-bento-section__bank-layout">
      <div className="landing-bento-section__filter-list">
        <div className="landing-bento-section__filter-header">
          <small>分類</small>
          <small>128 題</small>
        </div>
        {BANK_CATEGORIES.map(({ label, active }) => (
          <span key={label} className={active ? "is-active" : ""}>{label}</span>
        ))}
      </div>
      <div className="landing-bento-section__table-lines">
        {BANK_TYPES.map(({ type, count }) => (
          <div key={type}>
            <strong>{type}</strong>
            <span className="landing-bento-section__table-bar" />
            <em>{count}</em>
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

const ANALYTICS_OPTIONS = [
  { label: "A", pct: 36, correct: false },
  { label: "B", pct: 46, correct: true },
  { label: "C", pct: 12, correct: false },
  { label: "D", pct: 6, correct: false },
] as const;

const AnalyticsMock = () => (
  <div className="landing-bento-section__mock landing-bento-section__mock--analytics" aria-hidden="true">
    <div className="landing-bento-section__bento-card landing-bento-section__bento-card--dist">
      <div className="landing-bento-section__bento-qhead">
        <em>Q40 · 單選題</em>
        <strong>Which strategy prevents deadlock?</strong>
      </div>
      <div className="landing-bento-section__bento-options">
        {ANALYTICS_OPTIONS.map(({ label, pct, correct }) => (
          <div key={label} className={`landing-bento-section__bento-option${correct ? " is-correct" : ""}`}>
            <span>{label}</span>
            <div><i style={{ width: `${pct}%` }} /></div>
            <strong>{pct}%</strong>
          </div>
        ))}
      </div>
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
