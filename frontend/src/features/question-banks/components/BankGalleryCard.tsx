import { ClickableTile, Tile } from "@carbon/react";
import { CheckmarkFilled, Download } from "@carbon/icons-react";
import type { BankCategory } from "@/core/entities/question-bank.entity";
import { getClassroomIcon } from "@/features/classroom/constants/classroomIcons";
import styles from "./BankGalleryCard.module.scss";

function renderBankIcon(icon: string | undefined, size: number) {
  const Icon = getClassroomIcon(icon);
  return <Icon size={size} />;
}

export interface BankGalleryCardProps {
  title: string;
  provider: string;
  category: BankCategory;
  providerVerified?: boolean;
  downloads?: string;
  coverUrl?: string;
  icon?: string;
  onClick?: () => void;
}

export const BankGalleryCard = ({
  title,
  provider,
  providerVerified = false,
  downloads = "0",
  coverUrl,
  icon,
  onClick,
}: BankGalleryCardProps) => {
  const bannerStyle = coverUrl
    ? { backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 65%), url(${coverUrl})` }
    : undefined;
  const content = (
    <>
      <div className={styles.banner} style={bannerStyle}>
        <h4 className={styles.bannerTitle}>{title}</h4>
        <div className={styles.bannerAvatar}>
          {renderBankIcon(icon, 20)}
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

      {/* Mini view for mobile */}
      <div className={styles.miniBody}>
        <div className={styles.miniIcon}>
          {renderBankIcon(icon, 16)}
        </div>
        <div className={styles.miniInfo}>
          <h4>{title}</h4>
          <p>
            by {provider}
            {providerVerified && <CheckmarkFilled size={12} className={styles.verifiedIcon} />}
            {" · "}
            <Download size={12} aria-hidden /> {downloads}
          </p>
        </div>
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
