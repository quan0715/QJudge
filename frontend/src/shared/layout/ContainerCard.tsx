import React from "react";
import { Layer } from "@carbon/react";
import styles from "./ContainerCard.module.scss";

interface ContainerCardProps {
  children: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  /** Optional Carbon Layer level injection for stronger visual separation */
  layerLevel?: 0 | 1 | 2;
  /** Enable Carbon Layer wrapper to keep contrast from parent surfaces */
  withLayer?: boolean;
  className?: string;
  style?: React.CSSProperties;
  noPadding?: boolean;
}

const ContainerCard: React.FC<ContainerCardProps> = ({
  children,
  title,
  subtitle,
  action,
  layerLevel,
  withLayer = true,
  className,
  style,
  noPadding = false,
}) => {
  const headerClass = `${styles.header}${subtitle ? ` ${styles.headerWithSubtitle}` : ""}`;

  const card = (
    <div
      className={`${styles.card}${className ? ` ${className}` : ""}`}
      style={style}
    >
      {(title || action) && (
        <div className={headerClass}>
          {(title || subtitle) && (
            <div className={styles.titleGroup}>
              {title ? <h4 className={styles.title}>{title}</h4> : null}
              {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
            </div>
          )}
          {action ? <div className={styles.action}>{action}</div> : null}
        </div>
      )}
      <div className={noPadding ? styles.contentNoPadding : styles.content}>
        {children}
      </div>
    </div>
  );

  if (!withLayer) {
    return card;
  }

  if (layerLevel === undefined) {
    return <Layer className={styles.layerWrapper}>{card}</Layer>;
  }

  return (
    <Layer level={layerLevel} className={styles.layerWrapper}>
      {card}
    </Layer>
  );
};

export default ContainerCard;
