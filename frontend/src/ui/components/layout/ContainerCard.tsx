import React from "react";
import styles from "./ContainerCard.module.scss";

interface ContainerCardProps {
  children: React.ReactNode;
  title?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  noPadding?: boolean;
}

const ContainerCard: React.FC<ContainerCardProps> = ({
  children,
  title,
  action,
  className,
  style,
  noPadding = false,
}) => {
  return (
    <div
      className={`${styles.card} ${className || ''}`}
      style={style}
    >
      {(title || action) && (
        <div className={styles.header}>
          {title && (
            <h4 className={styles.title}>
              {title}
            </h4>
          )}
          {action && (
            <div className={styles.action}>
              {action}
            </div>
          )}
        </div>
      )}
      <div className={noPadding ? styles.contentNoPadding : styles.content}>
        {children}
      </div>
    </div>
  );
};

export default ContainerCard;
