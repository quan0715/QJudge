import type { FC } from "react";
import { Button } from "@carbon/react";
import { ArrowDownRight, ArrowRight } from "@carbon/icons-react";
import { STORYSET_ONLINE_TEST_RAFIKI_ILLUSTRATION } from "@/features/landing/assets/illustrations/storyset";
import "./HeroSection.scss";

interface HeroSectionProps {
  content: {
    eyebrow: string;
    title: string;
    subtitle: string;
    trust: string[];
    primaryCta: string;
    secondaryCta: string;
  };
  onPrimary: () => void;
  onSecondary: () => void;
}

const HeroSection: FC<HeroSectionProps> = ({ content, onPrimary, onSecondary }) => {
  return (
    <section id="top" className="landing-hero-section" data-testid="landing-section-hero">
      <div className="landing-hero-section__inner">
        <div className="landing-hero-section__copy">
          <div className="landing-hero-section__eyebrow">
            <span className="landing-hero-section__eyebrow-line" aria-hidden="true" />
            <span>{content.eyebrow}</span>
          </div>
          <h1>{content.title}</h1>
          <p>{content.subtitle}</p>

          <div className="landing-hero-section__actions">
            <Button kind="primary" size="xl" renderIcon={ArrowRight} onClick={onPrimary}>
              {content.primaryCta}
            </Button>
            <Button kind="tertiary" size="xl" renderIcon={ArrowDownRight} onClick={onSecondary}>
              {content.secondaryCta}
            </Button>
          </div>

          <div className="landing-hero-section__trust" aria-label="QJudge trust signals">
            {content.trust.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>

        <div className="landing-hero-section__visual">
          <div className="landing-hero-section__visual-stage">
            <img
              className="landing-hero-section__illustration"
              src={STORYSET_ONLINE_TEST_RAFIKI_ILLUSTRATION}
              alt="QJudge online exam illustration"
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
