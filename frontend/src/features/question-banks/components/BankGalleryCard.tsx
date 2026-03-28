import { ClickableTile, Tile } from "@carbon/react";
import { Code, CheckmarkFilled, Download, Document } from "@carbon/icons-react";
import type { BankCategory } from "@/core/entities/question-bank.entity";
import styles from "./BankGalleryCard.module.scss";

export interface BankGalleryCardProps {
  title: string;
  provider: string;
  category: BankCategory;
  providerVerified?: boolean;
  downloads?: string;
  onClick?: () => void;
}

export const BankGalleryCard = ({
  title,
  provider,
  category,
  providerVerified = false,
  downloads = "0",
  onClick,
}: BankGalleryCardProps) => {
  const CardIcon = category === "exam" ? Document : Code;
  const content = (
    <>
      <div className={styles.banner}>
        <h4 className={styles.bannerTitle}>{title}</h4>
        <div className={styles.bannerAvatar}>
          <CardIcon size={20} />
        </div>
      </div>

      <div className={styles.body}>
        <p className={styles.description}>
          by {provider}
          {providerVerified && (
            <CheckmarkFilled size={14} className={styles.verifiedIcon} />
          )}
        </p>
        <p className={styles.meta}>
          <Download size={14} aria-hidden />
          {downloads}
        </p>
      </div>
    </>
  );

  if (onClick) {
    return (
      <ClickableTile onClick={onClick} className={`${styles.galleryCard} ${styles.clickableCard}`}>
        {content}
      </ClickableTile>
    );
  }

  return <Tile className={styles.galleryCard}>{content}</Tile>;
};
