import { useEffect, useRef, useState, type FC } from "react";
import { ArrowRight } from "@carbon/icons-react";
import SectionHeading from "@/features/landing/components/SectionHeading";
import type { LandingWorkflowItem } from "@/features/landing/content/landingContent";
import "./UsageFlowSection.scss";

interface UsageFlowSectionProps {
  eyebrow: string;
  title: string;
  description: string;
  items: LandingWorkflowItem[];
}

interface FlowScreenshot {
  src: string;
  alt: string;
  caption: string;
}

interface FlowDetail {
  valueTitle: string;
  highlights: string[];
  screenshots: FlowScreenshot[];
}

const FLOW_DETAILS: FlowDetail[] = [
  {
    valueTitle: "快速建立正式考試規則與題型配置",
    highlights: ["設定考試時間、題型與配分", "指定班級與作答規則", "考前確認發布摘要"],
    screenshots: [
      {
        src: "/illustrations/flow_create-exam_admin-overview.png",
        alt: "QJudge 考試管理後台總覽",
        caption: "考試狀態與規則總覽",
      },
    ],
  },
  {
    valueTitle: "依課程主題生成初稿，教師再精修",
    highlights: ["輸入主題、難度與題型", "產生可編輯的題目初稿", "教師審核後再納入考試"],
    screenshots: [
      {
        src: "/illustrations/flow_create-exam_question-management.png",
        alt: "QJudge 考試題目管理介面",
        caption: "題目管理與編輯",
      },
      {
        src: "/illustrations/flow_ai-create_generation-interface.png",
        alt: "QJudge AI 輔助出題介面",
        caption: "AI 題目生成工作區",
      },
    ],
  },
  {
    valueTitle: "掌握學生作答進度與異常狀況",
    highlights: ["查看學生作答狀態", "追蹤繳交與剩餘時間", "標記需要處理的異常事件"],
    screenshots: [
      {
        src: "/illustrations/flow_proctor_event-log.png",
        alt: "QJudge 監考事件紀錄",
        caption: "異常事件追蹤",
      },
      {
        src: "/illustrations/flow_proctor_participants.png",
        alt: "QJudge 考生狀態總覽",
        caption: "學生作答進度監控",
      },
    ],
  },
  {
    valueTitle: "快速產出分數、弱點與趨勢洞察",
    highlights: ["自動整理成績與答題狀態", "比較題目答對率與班級趨勢", "找出需要補強的學習弱點"],
    screenshots: [
      {
        src: "/illustrations/flow_grading_matrix.png",
        alt: "QJudge 成績批改矩陣",
        caption: "逐題批改總覽",
      },
      {
        src: "/illustrations/flow_grading_answer-results.png",
        alt: "QJudge 逐題作答結果",
        caption: "學生作答詳細結果",
      },
    ],
  },
  {
    valueTitle: "將考題與分析回收成長期資產",
    highlights: ["累積可複用的題庫", "標記主題、難度與使用紀錄", "用考後數據改善題目品質"],
    screenshots: [
      {
        src: "/illustrations/flow_question-bank_statistics-detail.png",
        alt: "QJudge 題目統計詳細分析",
        caption: "考後數據驅動題目改善",
      },
    ],
  },
];

const UsageFlowSection: FC<UsageFlowSectionProps> = ({ eyebrow, title, description, items }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const chapterRefs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (!visibleEntry) {
          return;
        }

        const index = Number((visibleEntry.target as HTMLElement).dataset.flowIndex);
        if (!Number.isNaN(index)) {
          setActiveIndex(index);
        }
      },
      {
        root: null,
        rootMargin: "-38% 0px -38% 0px",
        threshold: [0.2, 0.45, 0.7],
      },
    );

    const chapters = chapterRefs.current.filter((chapter): chapter is HTMLElement => chapter !== null);
    chapters.forEach((chapter) => observer.observe(chapter));

    return () => observer.disconnect();
  }, []);

  const scrollToChapter = (index: number) => {
    const chapter = chapterRefs.current[index];
    if (!chapter) {
      return;
    }

    const prefersReducedMotion =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    chapter.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center" });
  };

  return (
    <section className="landing-flow-section landing-section" data-testid="landing-section-flow">
      <div className="landing-section__inner">
        <SectionHeading eyebrow={eyebrow} title={title} description={description} />

        <div className="landing-flow-section__overview" aria-label="QJudge 完整考試流程總覽">
          {items.map((item, index) => (
            <div key={item.step} className="landing-flow-section__timeline-item">
              <article className="landing-flow-section__step">
                <span>{item.step}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <small>{item.output}</small>
              </article>
              {index < items.length - 1 ? <ArrowRight size={18} className="landing-flow-section__arrow" /> : null}
            </div>
          ))}
        </div>

        <div className="landing-flow-section__story">
          <div className="landing-flow-section__progress" aria-label="目前探索步驟">
            {items.map((item, index) => (
              <button
                key={item.step}
                type="button"
                className="landing-flow-section__progress-step"
                aria-label={`前往 ${item.step} ${item.title}`}
                aria-current={activeIndex === index ? "step" : undefined}
                onClick={() => scrollToChapter(index)}
              >
                <span>{item.step}</span>
                <strong>{item.title}</strong>
              </button>
            ))}
          </div>

          <div className="landing-flow-section__chapters">
            {items.map((item, index) => {
              const detail = FLOW_DETAILS[index] ?? FLOW_DETAILS[0];
              const isActive = activeIndex === index;

              return (
                <article
                  key={item.step}
                  ref={(node) => {
                    chapterRefs.current[index] = node;
                  }}
                  className={`landing-flow-section__chapter${isActive ? " landing-flow-section__chapter--active" : ""}`}
                  data-flow-index={index}
                >
                  <div className="landing-flow-section__chapter-copy">
                    <p className="landing-flow-section__chapter-kicker">Step {item.step}</p>
                    <h3>{item.title}</h3>
                    <h4>{detail.valueTitle}</h4>
                    <p>{item.description}</p>
                    <ul aria-label={`${item.title} 操作亮點`}>
                      {detail.highlights.map((highlight) => (
                        <li key={highlight}>{highlight}</li>
                      ))}
                    </ul>
                    <small>{item.output}</small>
                  </div>

                  <div className="landing-flow-section__screens" aria-label={`${item.title} 產品畫面`}>
                    {detail.screenshots.map((screenshot, screenshotIndex) => (
                      <figure
                        key={screenshot.src}
                        className={`landing-flow-section__screen landing-flow-section__screen--${screenshotIndex + 1}`}
                      >
                        <img src={screenshot.src} alt={screenshot.alt} loading="lazy" />
                        <figcaption>{screenshot.caption}</figcaption>
                      </figure>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className="landing-flow-section__summary" aria-label="QJudge 流程總結">
          <p>完整旅程</p>
          <strong>從建立考試、AI 出題、監考、批改分析到題庫沉澱，QJudge 將正式評量流程收斂成可持續運作的一條龍系統。</strong>
        </div>
      </div>
    </section>
  );
};

export default UsageFlowSection;
