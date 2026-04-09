import type { FC } from "react";
import { Grid, Column } from "@carbon/react";
import PricingCard from "@/features/pricing/components/PricingCard";
import SectionHeading from "@/features/landing/components/SectionHeading";
import "./PricingSection.scss";

interface PricingSectionProps {
  eyebrow: string;
  title: string;
  description: string;
  cards: Array<{
    name: string;
    price: string;
    period?: string;
    description: string;
    badge?: string;
    highlighted?: boolean;
    cta: string;
    target: "register" | "pricing" | "contact";
    features: Array<{ text: string }>;
  }>;
  onRegister: () => void;
  onPricing: () => void;
  onContact: () => void;
  disclaimer: string;
}

const PricingSection: FC<PricingSectionProps> = ({
  eyebrow,
  title,
  description,
  cards,
  onRegister,
  onPricing,
  onContact,
  disclaimer,
}) => {
  const actionMap = {
    register: onRegister,
    pricing: onPricing,
    contact: onContact,
  } as const;

  return (
    <section id="landing-pricing" className="landing-pricing-section landing-section" data-testid="landing-section-pricing">
      <div className="landing-section__inner">
        <SectionHeading eyebrow={eyebrow} title={title} description={description} align="center" />

        <Grid fullWidth className="landing-pricing-section__grid">
          {cards.map((card) => (
            <Column key={card.name} sm={4} md={8} lg={5}>
              <PricingCard
                name={card.name}
                price={card.price}
                period={card.period}
                description={card.description}
                badge={card.badge}
                highlighted={card.highlighted}
                ctaLabel={card.cta}
                features={card.features}
                onCtaClick={actionMap[card.target]}
              />
            </Column>
          ))}
        </Grid>

        <p className="landing-pricing-section__disclaimer">{disclaimer}</p>
      </div>
    </section>
  );
};

export default PricingSection;
