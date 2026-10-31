import type { FC } from "react";
import { Button } from "@carbon/react";
import { ArrowDownRight, ArrowRight } from "@carbon/icons-react";
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
      <img
        className="landing-hero-section__background"
        src="/illustrations/product-exam-q1-20261030.webp"
        alt=""
        fetchPriority="high"
        aria-hidden="true"
      />
      <div className="landing-hero-section__inner">
        <div className="landing-hero-section__copy">
          <div className="landing-hero-section__eyebrow">
            <span className="landing-hero-section__eyebrow-line" aria-hidden="true" />
            <span>{content.eyebrow}</span>
          </div>
          <h1>{content.title}</h1>
          <p>{content.subtitle}</p>

          <div className="landing-hero-section__actions">
            <Button className="landing-hero-section__action" kind="primary" size="xl" renderIcon={ArrowRight} onClick={onPrimary}>
              {content.primaryCta}
            </Button>
            <Button className="landing-hero-section__action" kind="tertiary" size="xl" renderIcon={ArrowDownRight} onClick={onSecondary}>
              {content.secondaryCta}
            </Button>
          </div>

          <div className="landing-hero-section__trust" aria-label="QJudge trust signals">
            {content.trust.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
};

export default HeroSection;
