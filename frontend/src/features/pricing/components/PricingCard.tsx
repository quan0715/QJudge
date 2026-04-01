import { Button, Tag } from "@carbon/react";
import { Checkmark } from "@carbon/icons-react";
import styles from "./PricingCard.module.scss";

interface PricingFeature {
  text: string;
}

interface PricingCardProps {
  name: string;
  price: string;
  period?: string;
  description: string;
  features: PricingFeature[];
  ctaLabel: string;
  onCtaClick: () => void;
  highlighted?: boolean;
  badge?: string;
  disabled?: boolean;
  current?: boolean;
}

export default function PricingCard({
  name,
  price,
  period,
  description,
  features,
  ctaLabel,
  onCtaClick,
  highlighted = false,
  badge,
  disabled = false,
  current = false,
}: PricingCardProps) {
  return (
    <div
      className={`${styles.card} ${highlighted ? styles.highlighted : ""} ${current ? styles.current : ""}`}
    >
      <div className={styles.top}>
        <div className={styles.nameRow}>
          <span className={styles.name}>{name}</span>
          {badge && (
            <Tag type="cyan" size="sm" className={styles.badge}>
              {badge}
            </Tag>
          )}
          {current && (
            <Tag type="green" size="sm">目前方案</Tag>
          )}
        </div>
        <p className={styles.description}>{description}</p>
      </div>

      <div className={styles.priceSection}>
        <span className={styles.price}>{price}</span>
        {period && <span className={styles.period}> / {period}</span>}
      </div>

      <ul className={styles.features}>
        {features.map((f, i) => (
          <li key={i} className={styles.featureItem}>
            <Checkmark size={14} className={styles.checkIcon} />
            <span>{f.text}</span>
          </li>
        ))}
      </ul>

      <Button
        kind={highlighted ? "primary" : "tertiary"}
        size="md"
        className={styles.cta}
        onClick={onCtaClick}
        disabled={disabled || current}
      >
        {current ? "目前方案" : ctaLabel}
      </Button>
    </div>
  );
}
