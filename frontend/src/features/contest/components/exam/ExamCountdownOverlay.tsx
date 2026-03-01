import type { ReactNode } from "react";
import styles from "./ExamCountdownOverlay.module.scss";

interface ExamCountdownOverlayProps {
  value: number;
  title?: ReactNode;
  message?: ReactNode;
  hint?: ReactNode;
  showGo?: boolean;
}

const ExamCountdownOverlay = ({
  value,
  title,
  message,
  hint,
  showGo = false,
}: ExamCountdownOverlayProps) => {
  const displayValue = showGo && value <= 0 ? "GO" : Math.max(0, value).toString();

  return (
    <div className={styles.overlay}>
      <div className={styles.ring} />
      <div className={styles.ringProgress} />
      {title ? <h2 className={styles.title}>{title}</h2> : null}
      {message ? <p className={styles.message}>{message}</p> : null}
      <div className={styles.number} key={displayValue}>
        {displayValue}
      </div>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  );
};

export default ExamCountdownOverlay;
