import type { FC } from "react";
import SectionHeading from "@/features/landing/components/SectionHeading";
import "./SocialProofSection.scss";

interface SocialProofSectionProps {
  eyebrow: string;
  title: string;
  description: string;
  metrics: Array<{ value: string; label: string; description: string }>;
  caseStudies: Array<{
    title: string;
    background: string;
    solution: string;
    outcome: string;
  }>;
}

const SocialProofSection: FC<SocialProofSectionProps> = ({
  eyebrow,
  title,
  description,
  caseStudies,
}) => {
  return (
    <section className="landing-social-proof-section landing-section" data-testid="landing-section-social-proof">
      <div className="landing-section__inner">
        <SectionHeading eyebrow={eyebrow} title={title} description={description} align="center" />

        <div className="landing-social-proof-section__gallery">
          {caseStudies.map((item, index) => (
            <div key={item.title} className="landing-social-proof-section__card">
              <div className="landing-social-proof-section__card-content">
                <p className="landing-social-proof-section__card-tag">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {item.title}
                </p>
                <p className="landing-social-proof-section__card-context">{item.background}</p>
                <blockquote className="landing-social-proof-section__card-outcome">
                  {item.outcome}
                </blockquote>
              </div>
              <div className="landing-social-proof-section__card-image" aria-hidden="true">
                <span>產品截圖</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default SocialProofSection;
