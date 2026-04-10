import type { FC } from "react";
import { Button } from "@carbon/react";
import { ArrowUpRight, ArrowRight } from "@carbon/icons-react";
import "./FooterCtaSection.scss";

interface FooterCtaSectionProps {
  content: {
    title: string;
    subtitle: string;
    primaryCta: string;
    secondaryCta: string;
    productLinks: Array<{ label: string; href: string }>;
    contactLinks: Array<{ label: string; href: string }>;
    legalLinks: Array<{ label: string; href: string }>;
    attribution: string;
  };
  onPrimary: () => void;
  onSecondary: () => void;
}

const FooterLinkList = ({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; href: string }>;
}) => (
  <div>
    <h3>{title}</h3>
    <ul>
      {items.map((item) => (
        <li key={item.label}>
          <a
            href={item.href}
            target={item.href.startsWith("http") ? "_blank" : undefined}
            rel={item.href.startsWith("http") ? "noreferrer" : undefined}
          >
            {item.label}
          </a>
        </li>
      ))}
    </ul>
  </div>
);

const FooterCtaSection: FC<FooterCtaSectionProps> = ({ content, onPrimary, onSecondary }) => {
  return (
    <footer id="landing-footer-cta" className="landing-footer-section" data-testid="landing-section-footer">
      <div className="landing-footer-section__cta">
        <div>
          <p className="landing-footer-section__eyebrow">QJudge</p>
          <h2>{content.title}</h2>
          <p>{content.subtitle}</p>
        </div>
        <div className="landing-footer-section__actions">
          <Button kind="primary" size="lg" renderIcon={ArrowRight} onClick={onPrimary}>
            {content.primaryCta}
          </Button>
          <Button kind="tertiary" size="lg" renderIcon={ArrowUpRight} onClick={onSecondary}>
            {content.secondaryCta}
          </Button>
        </div>
      </div>

      <div className="landing-footer-section__meta">
        <FooterLinkList title="產品" items={content.productLinks} />
        <FooterLinkList title="聯絡" items={content.contactLinks} />
        <FooterLinkList title="法律" items={content.legalLinks} />
      </div>

      <div className="landing-footer-section__bottom">
        <span>{content.attribution}</span>
        <a href="https://storyset.com/test" target="_blank" rel="noreferrer">
          Storyset
        </a>
      </div>
    </footer>
  );
};

export default FooterCtaSection;
