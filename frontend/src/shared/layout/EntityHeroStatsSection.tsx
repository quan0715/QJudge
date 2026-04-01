import type { ReactNode } from "react";
import styles from "./EntityHeroStatsSection.module.scss";

interface EntityHeroStatsSectionProps {
  title: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
  kpi: ReactNode;
  className?: string;
}

const EntityHeroStatsSection = ({
  title,
  meta,
  description,
  kpi,
  className,
}: EntityHeroStatsSectionProps) => {
  return (
    <section className={`${styles.hero}${className ? ` ${className}` : ""}`}>
      <div className={styles.heroInner}>
        <div className={styles.topRow}>
          <div className={styles.infoCol}>
            <div className={styles.title}>{title}</div>
            {meta ? <div className={styles.metaRow}>{meta}</div> : null}
            {description ? <div className={styles.description}>{description}</div> : null}
          </div>

          <div className={styles.kpiGrid}>
            <div className={styles.kpiStrip}>{kpi}</div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default EntityHeroStatsSection;
