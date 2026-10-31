import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
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

const getFlowDetails = (t: TFunction<"landing">): FlowDetail[] => [
  {
    valueTitle: t("ui.flowDetail0"),
    highlights: [t("ui.flowDetail1"), t("ui.flowDetail2"), t("ui.flowDetail3")],
    screenshots: [
      {
        src: "/illustrations/flow_create_exam_overview.png",
        alt: t("ui.flowDetail4"),
        caption: t("ui.flowDetail5"),
      },
      {
        src: "/illustrations/flow_exam_question_management.png",
        alt: t("ui.flowDetail6"),
        caption: t("ui.flowDetail7"),
      },
    ],
  },
  {
    valueTitle: t("ui.flowDetail8"),
    highlights: [t("ui.flowDetail9"), t("ui.flowDetail10"), t("ui.flowDetail11")],
    screenshots: [
      {
        src: "/illustrations/product-exam-q1-20261030.webp",
        alt: t("ui.examScreenshotAlt"),
        caption: t("ui.examScreenshotCaption"),
      },
      {
        src: "/illustrations/product-proctoring-demo-20261030.webp",
        alt: t("ui.flowDetail12"),
        caption: t("ui.flowDetail13"),
      },
    ],
  },
  {
    valueTitle: t("ui.flowDetail14"),
    highlights: [t("ui.flowDetail15"), t("ui.flowDetail16"), t("ui.flowDetail17")],
    screenshots: [
      {
        src: "/illustrations/product-ai-grading-20261030.webp",
        alt: t("ui.flowDetail18"),
        caption: t("ui.flowDetail19"),
      },
      {
        src: "/illustrations/flow_answer_results.png",
        alt: t("ui.flowDetail20"),
        caption: t("ui.flowDetail21"),
      },
      [
        {
          src: "/illustrations/flow_statistics_report_first_page.png",
          alt: t("ui.flowDetail22"),
          caption: t("ui.flowDetail23"),
          variant: "document",
        },
        {
          src: "/illustrations/flow_statistics_report_page_3.png",
          alt: t("ui.flowDetail24"),
          caption: t("ui.flowDetail25"),
          variant: "document",
        },
      ],
    ],
  },
  {
    valueTitle: t("ui.flowDetail26"),
    highlights: [t("ui.flowDetail27"), t("ui.flowDetail28"), t("ui.flowDetail29")],
    screenshots: [
      {
        src: "/illustrations/flow_exam_statistics.png",
        alt: t("ui.flowDetail30"),
        caption: t("ui.flowDetail31"),
      },
      {
        src: "/illustrations/flow_statistics_lowest_score_rate.png",
        alt: t("ui.flowDetail32"),
        caption: t("ui.flowDetail33"),
      },
    ],
  },
];


const UsageFlowSection: FC<UsageFlowSectionProps> = ({ eyebrow, title, description, items }) => {
  const { t } = useTranslation("landing");
  const FLOW_DETAILS = getFlowDetails(t);
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

        <div className="landing-flow-section__overview" aria-label={t("ui.flowOverview")}>
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
                    <ul aria-label={t("ui.highlights", { title: item.title })}>
                      {detail.highlights.map((highlight) => (
                        <li key={highlight}>{highlight}</li>
                      ))}
                    </ul>
                    <small>{item.output}</small>
                  </div>

                  <div className="landing-flow-section__screens" aria-label={t("ui.productScreens", { title: item.title })}>
                    <div className="landing-flow-section__screens-head">
                      <span>{t("ui.screenshots")}</span>
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

        <div className="landing-flow-section__summary" aria-label={t("ui.flowSummaryLabel")}>
          <p>{t("ui.journey")}</p>
          <strong>{t("ui.flowSummary")}</strong>
        </div>
      </div>
    </section>
  );
};

export default UsageFlowSection;
