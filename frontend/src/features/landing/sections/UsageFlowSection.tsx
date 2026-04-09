import type { FC } from "react";
import { ArrowRight } from "@carbon/icons-react";
import SectionHeading from "@/features/landing/components/SectionHeading";
import { STORYSET_ONLINE_TEST_ILLUSTRATION } from "@/features/landing/assets/illustrations/storyset";
import "./UsageFlowSection.scss";

interface UsageFlowSectionProps {
  eyebrow: string;
  title: string;
  description: string;
  quickStartTitle: string;
  flywheelTitle: string;
  quickStart: Array<{ step: string; title: string; description: string }>;
  flywheel: Array<{ step: string; title: string; description: string }>;
}

const UsageFlowSection: FC<UsageFlowSectionProps> = ({
  eyebrow,
  title,
  description,
  quickStartTitle,
  flywheelTitle,
  quickStart,
  flywheel,
}) => {
  return (
    <section className="landing-flow-section landing-section" data-testid="landing-section-flow">
      <div className="landing-section__inner">
        <SectionHeading eyebrow={eyebrow} title={title} description={description} align="center" />

        <div className="landing-flow-section__hero">
          <div className="landing-flow-section__card">
            <h3>{quickStartTitle}</h3>
            <div className="landing-flow-section__steps">
              {quickStart.map((item) => (
                <article key={item.step} className="landing-flow-section__step">
                  <span>{item.step}</span>
                  <h4>{item.title}</h4>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="landing-flow-section__illustration-shell">
            <img src={STORYSET_ONLINE_TEST_ILLUSTRATION} alt="" aria-hidden="true" />
          </div>
        </div>

        <div className="landing-flow-section__card landing-flow-section__card--flywheel">
          <h3>{flywheelTitle}</h3>
          <div className="landing-flow-section__flywheel">
            {flywheel.map((item, index) => (
              <div key={item.step} className="landing-flow-section__flywheel-item">
                <article className="landing-flow-section__step">
                  <span>{item.step}</span>
                  <h4>{item.title}</h4>
                  <p>{item.description}</p>
                </article>
                {index < flywheel.length - 1 ? <ArrowRight size={18} className="landing-flow-section__arrow" /> : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default UsageFlowSection;
