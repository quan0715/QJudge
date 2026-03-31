import React from 'react';
import { SkeletonText, SkeletonPlaceholder } from '@carbon/react';
import styles from './QJudgeHeroWidget.module.scss';

export interface QJudgeHeroWidgetProps {
  // Content
  title: React.ReactNode;
  description?: React.ReactNode;
  breadcrumbs?: React.ReactNode;
  badges?: React.ReactNode;
  metadata?: React.ReactNode;
  actions?: React.ReactNode;
  kpiCards?: React.ReactNode;
  progressBar?: React.ReactNode;

  // Visuals
  icon?: React.ComponentType<{ size: number; className?: string }>;
  coverUrl?: string;
  backgroundGradient?: string;

  // Bottom Integration
  tabs?: React.ReactNode;

  // Layout & State
  maxWidth?: string; // e.g. '84rem'
  loading?: boolean;
  className?: string;
}

/**
 * QJudgeHeroWidget - The standard hero section for entity pages.
 * Renders a "dark" variant when coverUrl or backgroundGradient is provided,
 * otherwise renders a "plain" variant with standard theme colors.
 */
export const QJudgeHeroWidget: React.FC<QJudgeHeroWidgetProps> = ({
  title,
  description,
  breadcrumbs,
  badges,
  metadata,
  actions,
  kpiCards,
  progressBar,
  icon: Icon,
  coverUrl,
  backgroundGradient,
  tabs,
  maxWidth = '84rem',
  loading = false,
  className = '',
}) => {
  const isDark = Boolean(coverUrl || backgroundGradient);

  if (loading) {
    return (
      <div className={`${styles.heroContainer} ${styles.heroPlain}`} style={{ minHeight: '10rem' }}>
        <div className={styles.inner} style={{ maxWidth }}>
          <SkeletonText heading width="30%" />
          <SkeletonText width="60%" />
          <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
            <SkeletonPlaceholder style={{ width: '100px', height: '40px' }} />
            <SkeletonPlaceholder style={{ width: '100px', height: '40px' }} />
          </div>
        </div>
      </div>
    );
  }

  const containerStyle: React.CSSProperties = {};
  if (coverUrl) {
    containerStyle.backgroundImage = `url(${coverUrl})`;
  } else if (backgroundGradient) {
    containerStyle.background = backgroundGradient;
  }

  const variantClass = isDark ? styles.heroDark : styles.heroPlain;

  return (
    <div
      className={`${styles.heroContainer} ${variantClass} ${className}`}
      style={containerStyle}
    >
      {/* Overlay only for background images to ensure text readability */}
      {Boolean(coverUrl) && <div className={styles.overlay} />}

      <div className={styles.inner} style={{ maxWidth }}>
        {breadcrumbs && (
          <div className={styles.breadcrumbRow}>
            {breadcrumbs}
          </div>
        )}

        <div className={styles.mainRow}>
          <div className={styles.infoCol}>
            {Icon && (
              <div className={styles.iconWrapper}>
                <Icon size={32} />
              </div>
            )}

            {badges && (
              <div className={styles.badgeRow}>
                {badges}
              </div>
            )}

            <h1 className={styles.title}>
              {title}
            </h1>

            {description && (
              <div className={styles.description}>
                {description}
              </div>
            )}

            {metadata && (
              <div className={styles.metadataRow}>
                {metadata}
              </div>
            )}

            {actions && (
              <div className={styles.actions}>
                {actions}
              </div>
            )}
          </div>

          {kpiCards && (
            <div className={styles.sideCol}>
              <div className={styles.kpiGrid}>
                {kpiCards}
              </div>
            </div>
          )}
        </div>

        {progressBar && (
          <div className={styles.progressBarRow}>
            {progressBar}
          </div>
        )}
      </div>

      {tabs && (
        <div className={styles.tabsBar}>
          <div className={styles.tabsInner} style={{ maxWidth }}>
            {tabs}
          </div>
        </div>
      )}
    </div>
  );
};

export default QJudgeHeroWidget;
