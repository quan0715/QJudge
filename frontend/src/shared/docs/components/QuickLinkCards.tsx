import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ClickableTile, Tag } from "@carbon/react";
import { ArrowRight, Document } from "@carbon/icons-react";
import type { DocQuickLinkCardConfig } from "@/core/docs";
import { useDocsFramework } from "../contexts/DocsFrameworkContext";
import styles from "./QuickLinkCards.module.scss";

export interface QuickLinkCardsProps {
  cards?: DocQuickLinkCardConfig[];
}

const QuickLinkCards: React.FC<QuickLinkCardsProps> = ({ cards }) => {
  const { t } = useTranslation("docs");
  const navigate = useNavigate();
  const { routeBase, quickLinkIcons } = useDocsFramework();

  if (!cards?.length) {
    return null;
  }

  return (
    <div className={styles.grid}>
      {cards.map((link) => {
        const Icon =
          (link.icon ? quickLinkIcons[link.icon] : undefined) || Document;
        const firstLink = link.links[0];
        if (!firstLink) return null;

        return (
          <ClickableTile
            key={link.id}
            className={styles.card}
            onClick={() => navigate(`${routeBase}/${firstLink}`)}
          >
            <div className={styles.cardHeader}>
              <Icon size={24} />
              <Tag type={link.tagType || "blue"} size="sm">
                {t(link.tagKey || `quickLinks.${link.id}.tag`, link.id)}
              </Tag>
            </div>

            <h4 className={styles.cardTitle}>
              {t(link.titleKey || `quickLinks.${link.id}.title`, link.id)}
            </h4>

            <p className={styles.cardDescription}>
              {t(link.descriptionKey || `quickLinks.${link.id}.description`, "")}
            </p>

            <div className={styles.linkList}>
              {link.links.map((docLink) => (
                <span key={docLink} className={styles.linkItem}>
                  <ArrowRight size={14} />
                  {t(`nav.items.${docLink}`, docLink)}
                </span>
              ))}
            </div>
          </ClickableTile>
        );
      })}
    </div>
  );
};

export default QuickLinkCards;
