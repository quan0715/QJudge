import type { FC } from "react";
import { Tile } from "@carbon/react";
import SectionHeading from "@/features/landing/components/SectionHeading";
import "./BentoFeaturesSection.scss";

const SHOWCASE_EXAM_UI = "/illustrations/showcase-exam-ui.png";
const SHOWCASE_PROCTOR = "/illustrations/showcase-proctor.png";
const SHOWCASE_AI_CREATE = "/illustrations/showcase-ai-create.png";
const SHOWCASE_GRADING = "/illustrations/showcase-grading.png";
const QUESTION_BANK_SCREEN = "/docs/images/create_exam_tutorial.png";

interface BentoFeaturesSectionProps {
  eyebrow: string;
  title: string;
  description: string;
  cards: Array<{
    eyebrow: string;
    title: string;
    description: string;
    metric?: string;
    variant: "half" | "third" | "full";
    preview: "multiExam" | "proctoring" | "questionBank" | "ai" | "analytics";
  }>;
}

const BentoVisual = ({
  preview,
  metric,
}: {
  preview: BentoFeaturesSectionProps["cards"][number]["preview"];
  metric?: string;
}) => {
  if (preview === "multiExam") {
    return (
      <div className="landing-bento-section__visual landing-bento-section__visual--multi-exam">
        <div className="landing-bento-section__screenshot-shell">
          <img src={SHOWCASE_EXAM_UI} alt="" aria-hidden="true" />
        </div>
        <div className="landing-bento-section__editor-shell" aria-hidden="true">
          <div className="landing-bento-section__editor-topbar">
            <span />
            <span />
            <span />
          </div>
          <div className="landing-bento-section__editor-tabs">
            <span>main.py</span>
            <span>judge.py</span>
          </div>
          <div className="landing-bento-section__editor-code">
            <span className="w-90" />
            <span className="w-60" />
            <span className="w-80" />
            <span className="w-45" />
            <span className="w-70" />
          </div>
        </div>
      </div>
    );
  }

  if (preview === "ai") {
    return (
      <div className="landing-bento-section__visual landing-bento-section__visual--ai">
        {metric ? <div className="landing-bento-section__metric">{metric}</div> : null}
        <div className="landing-bento-section__screenshot-shell">
          <img src={SHOWCASE_AI_CREATE} alt="" aria-hidden="true" />
        </div>
      </div>
    );
  }

  if (preview === "analytics") {
    return (
      <div className="landing-bento-section__visual landing-bento-section__visual--analytics">
        <div className="landing-bento-section__screenshot-shell landing-bento-section__screenshot-shell--wide">
          <img src={SHOWCASE_GRADING} alt="" aria-hidden="true" />
        </div>
      </div>
    );
  }

  const imageSrc =
    preview === "proctoring"
      ? SHOWCASE_PROCTOR
      : preview === "questionBank"
        ? QUESTION_BANK_SCREEN
        : SHOWCASE_EXAM_UI;

  return (
    <div className={`landing-bento-section__visual landing-bento-section__visual--${preview}`}>
      <div className="landing-bento-section__screenshot-shell">
        <img src={imageSrc} alt="" aria-hidden="true" />
      </div>
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
              <BentoVisual preview={card.preview} metric={card.metric} />
            </Tile>
          ))}
        </div>
      </div>
    </section>
  );
};

export default BentoFeaturesSection;
