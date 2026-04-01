import type { ReactNode } from "react";
import styles from "./EntityOverviewFrame.module.scss";

interface EntityOverviewFrameProps {
  hero?: ReactNode;
  main: ReactNode;
  side?: ReactNode;
  className?: string;
  /** Extra class applied to the .section wrapper (useful for overriding padding) */
  sectionClassName?: string;
}

const EntityOverviewFrame = ({ hero, main, side, className, sectionClassName }: EntityOverviewFrameProps) => {
  return (
    <div className={`${styles.root}${className ? ` ${className}` : ""}`}>
      {hero}
      <div className={`${styles.section}${sectionClassName ? ` ${sectionClassName}` : ""}`}>
        <div className={styles.sectionInner}>
          <div className={`${styles.bodyGrid}${!side ? ` ${styles.singleColumn}` : ""}`}>
            <div className={styles.mainCol}>{main}</div>
            {side ? <div className={styles.sideCol}>{side}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EntityOverviewFrame;
