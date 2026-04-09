import type { FC } from "react";
import "./FooterCtaSection.scss";

const NOTION_DEMO_FORM_URL = "https://bedecked-griffin-98f.notion.site/ebd/b532286e832b4846a8f08298b6942fcc";

interface FooterCtaSectionProps {
  content: {
    title: string;
    subtitle: string;
    productLinks: Array<{ label: string; href: string }>;
    contactLinks: Array<{ label: string; href: string }>;
    legalLinks: Array<{ label: string; href: string }>;
    attribution: string;
  };
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
          <a href={item.href}>{item.label}</a>
        </li>
      ))}
    </ul>
  </div>
);

const FooterCtaSection: FC<FooterCtaSectionProps> = ({ content }) => {
  return (
    <footer id="landing-footer-cta" className="landing-footer-section" data-testid="landing-section-footer">
      <div className="landing-footer-section__cta">
        <div>
          <p className="landing-footer-section__eyebrow">QJudge</p>
          <h2>{content.title}</h2>
          <p>{content.subtitle}</p>
        </div>
      </div>

      <div className="landing-footer-section__form-block" id="landing-demo-form">
        <div className="landing-footer-section__form-copy">
          <p className="landing-footer-section__form-eyebrow">預約 Demo</p>
          <h3>直接留下需求，我們會盡快與你聯繫</h3>
          <p>適合想了解校內導入、題庫遷移、正式考試流程與客製合作的團隊。</p>
        </div>
        <div className="landing-footer-section__form-frame">
          <iframe
            src={NOTION_DEMO_FORM_URL}
            title="QJudge Demo Reservation Form"
            width="100%"
            height="600"
            frameBorder="0"
            allowFullScreen
          />
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
