import type { FC } from "react";
import ProductPreview, { type ProductPreviewVariant } from "@/features/landing/assets/placeholders/ProductPreview";
import SectionHeading from "@/features/landing/components/SectionHeading";
import "./FeatureDetailsSection.scss";

interface FeatureDetailsSectionProps {
  eyebrow: string;
  title: string;
  description: string;
  items: Array<{
    title: string;
    description: string;
    points: string[];
    preview: ProductPreviewVariant;
  }>;
}

const FeatureDetailsSection: FC<FeatureDetailsSectionProps> = ({
  eyebrow,
  title,
  description,
  items,
}) => {
  return (
    <section className="landing-details-section landing-section" data-testid="landing-section-details">
      <div className="landing-section__inner">
        <SectionHeading eyebrow={eyebrow} title={title} description={description} />

        <div className="landing-details-section__list">
          {items.map((item, index) => (
            <article
              key={item.title}
              className={`landing-details-section__item ${index % 2 === 1 ? "landing-details-section__item--reverse" : ""}`}
            >
              <div className="landing-details-section__visual">
                <ProductPreview variant={item.preview} />
              </div>
              <div className="landing-details-section__copy">
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <ul>
                  {item.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeatureDetailsSection;
