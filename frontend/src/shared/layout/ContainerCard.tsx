import React from "react";
import styles from "./ContainerCard.module.scss";

interface ContainerCardProps {
  children: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  noPadding?: boolean;
}

const ContainerCard: React.FC<ContainerCardProps> = ({
  children,
  title,
  subtitle,
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
            <div>
              <h4 className={styles.title}>{title}</h4>
              {subtitle ? (
                <p
                  style={{
                    margin: "0.25rem 0 0",
                    color: "var(--cds-text-secondary)",
                    fontSize: "0.875rem",
                    lineHeight: 1.4,
                  }}
                >
                  {subtitle}
                </p>
              ) : null}
            </div>
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
