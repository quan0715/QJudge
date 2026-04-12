import type { FC } from "react";
import SectionHeading from "@/features/landing/components/SectionHeading";
import "./ProductPropositionSection.scss";

export interface PropositionItem {
  title: string;
  description: string;
}

interface ProductPropositionSectionProps {
  eyebrow: string;
  title: string;
  description: string;
  items: PropositionItem[];
}

const ProductPropositionSection: FC<ProductPropositionSectionProps> = ({
  eyebrow,
  title,
  description,
  items,
}) => {
  return (
    <section
      id="landing-proposition"
      className="landing-proposition-section landing-section"
      data-testid="landing-section-proposition"
    >
      <div className="landing-section__inner">
        <SectionHeading eyebrow={eyebrow} title={title} description={description} align="center" />

        <div className="landing-proposition-section__grid">
          {items.map((item, index) => (
            <div key={item.title} className="landing-proposition-section__item">
              <span className="landing-proposition-section__index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ProductPropositionSection;
