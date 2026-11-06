import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import styles from "./ExamWorkspaceShell.module.scss";

export interface ExamOverviewFact {
  key: string;
  label: string;
  value: ReactNode;
}

interface ExamOverviewLayoutProps {
  kicker: ReactNode;
  title: string;
  description: string;
  rules?: { title: string; body: string } | null;
  facts: ExamOverviewFact[];
  /** Primary actions, right of the facts. */
  actions?: ReactNode;
  /** Secondary content below the summary, e.g. records or clarifications. */
  details?: ReactNode;
  ariaLabel?: string;
}

/** One overview layout for trial runs and the formal student exam page. */
export function ExamOverviewLayout({ kicker, title, description, rules, facts, actions, details, ariaLabel }: ExamOverviewLayoutProps) {
  return (
    <section className={styles.overview} data-has-details={!!details} aria-label={ariaLabel ?? title}>
      <div className={styles.hero}>
        <span className={styles.kicker}>{kicker}</span>
        <h2 className={styles.heroTitle}>{title}</h2>
        <div className={styles.prose}><ReactMarkdown>{description}</ReactMarkdown></div>
        {rules && (
          <section className={styles.rules}>
            <h3>{rules.title}</h3>
            <div className={styles.prose}><ReactMarkdown>{rules.body}</ReactMarkdown></div>
          </section>
        )}
      </div>
      <footer className={styles.overviewFooter}>
        <dl className={styles.facts}>
          {facts.map((fact) => <div key={fact.key}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
        </dl>
        {actions && <div className={styles.overviewActions}>{actions}</div>}
      </footer>
      {details && <div className={styles.overviewDetails}>{details}</div>}
    </section>
  );
}
