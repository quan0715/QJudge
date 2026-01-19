import React from "react";
import styles from "./PageHeader.module.scss";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  extra?: React.ReactNode; 
  action?: React.ReactNode; // Alias for extra or secondary action
  tags?: React.ReactNode[];
  maxWidth?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  extra,
  action,
  tags,
  maxWidth,
}) => {
  const containerStyle = maxWidth
    ? ({ "--page-header-max-width": maxWidth } as React.CSSProperties)
    : undefined;

  return (
    <div className={styles.container} style={containerStyle}>
      {/* <Grid> */}
        {/* <Column lg={16} md={8} sm={4} className={styles.noGutter}> */}
          <div className={styles.row}>
            <div>
              <div className={styles.titleRow}>
                <h1 className={styles.title}>{title}</h1>
                {tags && tags.length > 0 && (
                  <div className={styles.tags}>{tags}</div>
                )}
              </div>
              {subtitle && (
                <p className={styles.subtitle}>{subtitle}</p>
              )}
            </div>
            {(extra || action) && (
              <div className={styles.actions}>
                {extra}
                {action}
              </div>
            )}
          </div>
        {/* </Column> */}
      {/* </Grid> */}
    </div>
  );
};
