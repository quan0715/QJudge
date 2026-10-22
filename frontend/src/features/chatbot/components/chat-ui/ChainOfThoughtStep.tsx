import { memo, useMemo } from "react";
import { AccordionItem } from "@carbon/react";
import { Checkmark, Warning, InProgress } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { CopilotToolPart } from "@copilot";
import { formatJson, formatToolName } from "./chainOfThoughtFormat";
import styles from "./ChainOfThought.module.scss";

export function StepStatusIcon({ step }: { step: CopilotToolPart }) {
  const isDone = step.state === "output-ready" || step.state === "error";
  const isFailed = step.state === "error";
  const Icon = isFailed ? Warning : isDone ? Checkmark : InProgress;
  const statusClass = isFailed ? styles.failure : isDone ? styles.success : styles.processing;
  return <Icon size={16} className={statusClass} />;
}

interface ChainOfThoughtStepProps {
  step: CopilotToolPart;
  index: number;
}

export const ChainOfThoughtStep = memo(function ChainOfThoughtStep({
  step,
  index,
}: ChainOfThoughtStepProps) {
  const { t } = useTranslation("chatbot");
  const inputJson = useMemo(
    () => (typeof step.input === "string" ? JSON.stringify(step.input) : formatJson(step.input)),
    [step.input],
  );
  const resultText = useMemo(() => formatJson(step.output), [step.output]);

  return (
    <AccordionItem
      title={
        <span className={styles.stepTitle}>
          <StepStatusIcon step={step} />
          {formatToolName(step.toolName, t)} #{index + 1}
        </span>
      }
    >
      {inputJson && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>{t("ui.stepInput")}</div>
          <pre className={styles.json}>{inputJson}</pre>
        </div>
      )}
      {resultText && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>{t("ui.stepOutput")}</div>
          <pre className={styles.json}>{resultText}</pre>
        </div>
      )}
    </AccordionItem>
  );
});
