import type { FC } from "react";
import { Tile } from "@carbon/react";
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
  metrics,
  caseStudies,
}) => {
  return (
    <section className="landing-social-proof-section landing-section" data-testid="landing-section-social-proof">
      <div className="landing-section__inner">
        <SectionHeading eyebrow={eyebrow} title={title} description={description} align="center" />

        <div className="landing-social-proof-section__metrics">
          {metrics.map((item) => (
            <Tile key={item.label} className="landing-social-proof-section__metric-card">
              <strong>{item.value}</strong>
              <h3>{item.label}</h3>
              <p>{item.description}</p>
            </Tile>
          ))}
        </div>

        <div className="landing-social-proof-section__cases">
          {caseStudies.map((item) => (
            <Tile key={item.title} className="landing-social-proof-section__case-card">
              <p className="landing-social-proof-section__case-label">{item.title}</p>
              <dl>
                <div>
                  <dt>背景</dt>
                  <dd>{item.background}</dd>
                </div>
                <div>
                  <dt>QJudge 方案</dt>
                  <dd>{item.solution}</dd>
                </div>
                <div>
                  <dt>成果</dt>
                  <dd>{item.outcome}</dd>
                </div>
              </dl>
            </Tile>
          ))}
        </div>
      </div>
    </section>
  );
};

export default SocialProofSection;
