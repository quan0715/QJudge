import type { FC } from "react";
import { Tile } from "@carbon/react";
import SectionHeading from "@/features/landing/components/SectionHeading";
import type { LandingWhyChooseItem } from "@/features/landing/content/landingContent";
import "./WhyChooseSection.scss";

interface WhyChooseSectionProps {
  eyebrow: string;
  title: string;
  description: string;
  items: LandingWhyChooseItem[];
}

const WhyChooseSection: FC<WhyChooseSectionProps> = ({ eyebrow, title, description, items }) => {
  return (
    <section id="landing-why" className="landing-why-section landing-section" data-testid="landing-section-why">
      <div className="landing-section__inner">
        <SectionHeading eyebrow={eyebrow} title={title} description={description} />

        <div className="landing-why-section__grid">
          {items.map((item, index) => (
            <Tile key={item.title} className="landing-why-section__item">
              <p className="landing-why-section__label">
                <span>{String(index + 1).padStart(2, "0")}</span>
                {item.label}
              </p>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </Tile>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhyChooseSection;
