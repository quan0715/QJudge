import type { FC } from "react";
import SectionHeading from "@/features/landing/components/SectionHeading";
import type { LandingCaseStudy } from "@/features/landing/content/landingContent";
import "./SocialProofSection.scss";

interface SocialProofSectionProps {
  eyebrow: string;
  title: string;
  description: string;
  caseStudies: LandingCaseStudy[];
}

const SocialProofSection: FC<SocialProofSectionProps> = ({ eyebrow, title, description, caseStudies }) => (
  <section className="landing-social-proof-section landing-section" data-testid="landing-section-social-proof">
    <div className="landing-section__inner">
      <SectionHeading eyebrow={eyebrow} title={title} description={description} align="center" />
      <div className="landing-social-proof-section__gallery">
        {caseStudies.map((item, index) => (
          <article key={item.title} className={`landing-social-proof-section__card${index % 2 ? " landing-social-proof-section__card--reverse" : ""}`}>
            <div className="landing-social-proof-section__card-content">
              <div className="landing-social-proof-section__card-org">
                <img src="/illustrations/nycu-logo.png" alt={item.institution} className="landing-social-proof-section__org-logo" loading="lazy" />
                <div>
                  <p className="landing-social-proof-section__org-school">{item.institution}</p>
                  <p className="landing-social-proof-section__org-dept">{item.department} · {item.course}</p>
                </div>
              </div>
              <h3 className="landing-social-proof-section__card-headline">{item.title}</h3>
              <p className="landing-social-proof-section__block-text">{item.summary}</p>
              <div className="landing-social-proof-section__card-block">
                <p className="landing-social-proof-section__block-label">{item.contextLabel}</p>
                <p className="landing-social-proof-section__block-text">{item.context}</p>
              </div>
              <div className="landing-social-proof-section__card-block">
                <p className="landing-social-proof-section__block-label">{item.challengeLabel}</p>
                <p className="landing-social-proof-section__block-text">{item.challenge}</p>
              </div>
            </div>
            <div className="landing-social-proof-section__card-image">
              <img src={item.imageSrc} alt={item.imageAlt} loading="lazy" />
            </div>
          </article>
        ))}
      </div>
    </div>
  </section>
);

export default SocialProofSection;
