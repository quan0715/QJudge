import { useId, type ReactNode } from "react";

import styles from "./ExamQuestionPreviewSection.module.scss";

interface ExamQuestionPreviewSectionProps {
  label: string;
  children: ReactNode;
}

export default function ExamQuestionPreviewSection({
  label,
  children,
}: ExamQuestionPreviewSectionProps) {
  const labelId = useId();

  return (
    <section className={styles.section} aria-labelledby={labelId}>
      <h3 id={labelId} className={styles.label}>
        {label}
      </h3>
      <div className={styles.content}>{children}</div>
    </section>
  );
}
