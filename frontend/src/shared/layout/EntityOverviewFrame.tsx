import type { ReactNode } from "react";
import styles from "./EntityOverviewFrame.module.scss";

interface EntityOverviewFrameProps {
  hero?: ReactNode;
  main: ReactNode;
  side?: ReactNode;
  className?: string;
}

const EntityOverviewFrame = ({ hero, main, side, className }: EntityOverviewFrameProps) => {
  return (
    <div className={`${styles.root}${className ? ` ${className}` : ""}`}>
      {hero}
      <div className={styles.section}>
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
