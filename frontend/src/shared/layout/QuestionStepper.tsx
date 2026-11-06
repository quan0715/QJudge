import styles from "./QuestionStepper.module.scss";

interface QuestionStepperProps {
  index: number;
  total: number;
  onChange: (index: number) => void;
  previousLabel: string;
  nextLabel: string;
}

/** Previous / next footer for a statement panel; owns no question state. */
export function QuestionStepper({ index, total, onChange, previousLabel, nextLabel }: QuestionStepperProps) {
  return (
    <div className={styles.stepper}>
      <button type="button" className={styles.step} disabled={index <= 0} onClick={() => onChange(index - 1)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14.5 6-6 6 6 6" /></svg>
        {previousLabel}
      </button>
      <span className={styles.counter} aria-live="polite">{index + 1} / {total}</span>
      <button type="button" className={styles.step} disabled={index >= total - 1} onClick={() => onChange(index + 1)}>
        {nextLabel}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9.5 6 6 6-6 6" /></svg>
      </button>
    </div>
  );
}
