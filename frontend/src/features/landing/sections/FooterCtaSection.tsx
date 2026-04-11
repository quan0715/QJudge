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

const FooterCtaSection: FC<FooterCtaSectionProps> = ({ content, onPrimary, onSecondary }) => {
  return (
    <footer id="landing-footer-cta" className="landing-footer-section" data-testid="landing-section-footer">

      {/* CTA */}
      <div className="landing-footer-section__wrap">
        <div className="landing-footer-section__cta">
          <div className="landing-footer-section__cta-copy">
            <p className="landing-footer-section__eyebrow">QJudge</p>
            <h2>{content.title}</h2>
            <p className="landing-footer-section__subtitle">{content.subtitle}</p>
          </div>
          <div className="landing-footer-section__actions">
            <Button kind="primary" size="lg" renderIcon={ArrowRight} onClick={onPrimary}>
              {content.primaryCta}
            </Button>
            <Button kind="ghost" size="lg" renderIcon={ArrowUpRight} onClick={onSecondary}>
              {content.secondaryCta}
            </Button>
          </div>
        </div>
      </div>

      {/* 分隔線 */}
      <div className="landing-footer-section__divider" />

      {/* 連結 */}
      <div className="landing-footer-section__wrap">
        <div className="landing-footer-section__meta">

          <div className="landing-footer-section__brand">
            <span className="landing-footer-section__brand-name">QJUDGE</span>
            <p>專為教育設計的線上考試平台</p>
            <p>把出題、監考、批改收進一個流程</p>
          </div>

          <div className="landing-footer-section__col">
            <h3>產品</h3>
            <ul>
              {content.productLinks.map((item) => (
                <li key={item.label}>
                  <a href={item.href}>{item.label}</a>
                </li>
              ))}
            </ul>
          </div>

          <div className="landing-footer-section__col">
            <h3>聯絡</h3>
            <ul>
              {content.contactLinks.map((item) => (
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

          <div className="landing-footer-section__col">
            <h3>法律</h3>
            <ul>
              {content.legalLinks.map((item) => (
                <li key={item.label}>
                  <a href={item.href}>{item.label}</a>
                </li>
              ))}
            </ul>
          </div>

        </div>
      </div>

      {/* 底部 */}
      <div className="landing-footer-section__wrap">
        <div className="landing-footer-section__bottom">
          <span>{content.attribution}</span>
        </div>
      </div>

    </footer>
  );
};

export default FooterCtaSection;
