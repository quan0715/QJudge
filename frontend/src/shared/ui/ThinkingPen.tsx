import { Pen } from "@carbon/icons-react";
import styles from "./ThinkingPen.module.scss";

const INK_PATH = "M 8 27 C 10 23, 12 23, 13 26 S 17 29, 19 25 S 22 23, 24 25";

/** Shared writing animation for chat and its navigation activity indicator. */
export function ThinkingPen({ size = 40 }: { size?: number }) {
  return (
    <span className={styles.orb} style={{ width: size, height: size }} aria-hidden="true">
      <span className={styles.scene} style={{ transform: `scale(${size / 40})` }}>
        <span className={styles.halo} />
        <svg className={styles.paper} viewBox="0 0 40 40" focusable="false">
          <path className={styles.ink} d={INK_PATH} pathLength="1" />
        </svg>
        <span className={styles.penMotion} style={{ offsetPath: `path("${INK_PATH}")` }}>
          <span className={styles.penLift}>
            <Pen size={22} className={styles.pen} />
          </span>
        </span>
      </span>
    </span>
  );
}
