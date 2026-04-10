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
  variant?: "wide" | "portrait" | "document";
}

interface FlowDetail {
  valueTitle: string;
  highlights: string[];
  screenshots: Array<FlowScreenshot | FlowScreenshot[]>;
}

const FLOW_DETAILS: FlowDetail[] = [
  {
    valueTitle: "快速建立正式考試，並完成題目配置",
    highlights: ["設定考試時間、題型與配分", "精修題目內容並納入考試", "指定班級與作答規則"],
    screenshots: [
      {
        src: "/illustrations/flow_create_exam_overview.png",
        alt: "QJudge 考試管理後台總覽",
        caption: "建立考試後先確認狀態、時間與可見性",
      },
      {
        src: "/illustrations/flow_ai-create_generation-interface.png",
        alt: "QJudge AI 輔助出題介面",
        caption: "依主題與難度產生可編輯的題目初稿",
      },
      {
        src: "/illustrations/flow_exam_question_management.png",
        alt: "QJudge 題目管理介面",
        caption: "教師檢查題目內容後再放入正式考試",
      },
    ],
  },
  {
    valueTitle: "掌握學生作答進度與異常狀況",
    highlights: ["查看學生作答狀態", "追蹤繳交與剩餘時間", "標記需要處理的異常事件"],
    screenshots: [
      {
        src: "/illustrations/flow_proctor_event_log.png",
        alt: "QJudge 監考事件紀錄",
        caption: "需要處理的事件集中在同一個紀錄中",
      },
    ],
  },
  {
    valueTitle: "快速完成批改，並將成績與回饋發布",
    highlights: ["自動整理成績與答題狀態", "檢查逐題批改結果", "發布可追蹤的成績與回饋"],
    screenshots: [
      {
        src: "/illustrations/flow_grading_matrix.png",
        alt: "QJudge 成績批改矩陣",
        caption: "用矩陣快速檢查每位學生與每題狀態",
      },
      {
        src: "/illustrations/flow_answer_results.png",
        alt: "QJudge 逐題作答結果",
        caption: "展開單題作答，確認答案與得分依據",
      },
      [
        {
          src: "/illustrations/flow_statistics_report_first_page.png",
          alt: "QJudge 個人成績報告第一頁",
          caption: "輸出個人成績報告，讓考後回饋可被保存與追蹤",
          variant: "document",
        },
        {
          src: "/illustrations/flow_statistics_report_page_3.png",
          alt: "QJudge 個人成績報告第三頁",
          caption: "補充題目表現細節，協助教師定位需要加強的觀念",
          variant: "document",
        },
      ],
    ],
  },
  {
    valueTitle: "將考題與分析回收成長期資產",
    highlights: ["累積可複用的題庫", "標記主題、難度與使用紀錄", "用考後數據改善題目品質"],
    screenshots: [
      {
        src: "/illustrations/flow_exam_statistics.png",
        alt: "QJudge 考後統計分析總覽",
        caption: "從考試總覽快速掌握整體表現與題目分佈",
      },
      {
        src: "/illustrations/flow_statistics_lowest_score_rate.png",
        alt: "QJudge 最低得分率題目列表",
        caption: "自動標記得分率最低的題目，優先回收檢討",
      },
    ],
  },
];


const UsageFlowSection: FC<UsageFlowSectionProps> = ({ eyebrow, title, description, items }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const chapterRefs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let animationFrame = 0;

    const updateActiveChapter = () => {
      animationFrame = 0;
      const chapters = chapterRefs.current.filter((chapter): chapter is HTMLElement => chapter !== null);
      if (chapters.length === 0) {
        return;
      }

      const focusLine = window.innerHeight * 0.5;
      const activeChapterIndex = chapters.findIndex((chapter) => {
        const rect = chapter.getBoundingClientRect();
        return rect.top <= focusLine && rect.bottom >= focusLine;
      });

      if (activeChapterIndex >= 0) {
        setActiveIndex(activeChapterIndex);
        return;
      }

      const nearest = chapters.reduce(
        (current, chapter, index) => {
          const rect = chapter.getBoundingClientRect();
          const distance = Math.min(Math.abs(rect.top - focusLine), Math.abs(rect.bottom - focusLine));
          return distance < current.distance ? { index, distance } : current;
        },
        { index: 0, distance: Number.POSITIVE_INFINITY },
      );

      setActiveIndex(nearest.index);
    };

    const requestUpdate = () => {
      if (animationFrame !== 0) {
        return;
      }
      animationFrame = window.requestAnimationFrame(updateActiveChapter);
    };

    updateActiveChapter();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);

    return () => {
      if (animationFrame !== 0) {
        window.cancelAnimationFrame(animationFrame);
      }
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
    };
  }, []);

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
          <div className="landing-flow-section__chapters">
            {items.map((item, index) => {
              const detail = FLOW_DETAILS[index] ?? FLOW_DETAILS[0];
              const screenshots = detail.screenshots.flatMap((screenshotStage) =>
                Array.isArray(screenshotStage) ? screenshotStage : [screenshotStage],
              );
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
                    <div className="landing-flow-section__screens-head">
                      <span>產品畫面</span>
                    </div>
                    {screenshots.length > 0 ? (
                      <div className="landing-flow-section__screen-track">
                        {screenshots.map((screenshot, screenshotIndex) => (
                          <figure
                            key={screenshot.src}
                            className={`landing-flow-section__screen landing-flow-section__screen--${
                              screenshot.variant ?? "wide"
                            }`}
                          >
                            <img src={screenshot.src} alt={screenshot.alt} loading="lazy" />
                            <figcaption>
                              <span>{`${screenshotIndex + 1}`.padStart(2, "0")}</span>
                              {screenshot.caption}
                            </figcaption>
                          </figure>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className="landing-flow-section__summary" aria-label="QJudge 流程總結">
          <p>完整旅程</p>
          <strong>從建立考試、題目配置、監考、批改發佈到考後改進，QJudge 將正式評量流程收斂成可持續運作的一條龍系統。</strong>
        </div>
      </div>
    </section>
  );
};

export default UsageFlowSection;
