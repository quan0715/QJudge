import { memo, useMemo } from "react";
import { Accordion, AccordionItem } from "@carbon/react";
import { Checkmark, Warning, InProgress } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { CopilotToolPart } from "@copilot";
import styles from "./ChainOfThought.module.scss";

interface ChainOfThoughtProps {
  steps: readonly CopilotToolPart[];
  isProcessing: boolean;
  currentToolName?: string;
}

interface StepProps {
  step: CopilotToolPart;
  index: number;
  inputLabel: string;
  outputLabel: string;
  displayToolName: string;
}

const ChainOfThoughtStep = memo(function ChainOfThoughtStep({
  step,
  index,
  inputLabel,
  outputLabel,
  displayToolName,
}: StepProps) {
  const isDone = step.state === "output-ready" || step.state === "error";
  const isFailed = step.state === "error";
  const StatusIcon = isFailed ? Warning : isDone ? Checkmark : InProgress;
  const statusClass = isFailed
    ? styles.failure
    : isDone
      ? styles.success
      : styles.processing;

  const inputJson = useMemo(() => {
    if (step.input === undefined || step.input === null) return "";
    try {
      return JSON.stringify(step.input, null, 2);
    } catch {
      return String(step.input);
    }
  }, [step.input]);

  const resultText = useMemo(() => {
    if (step.output === undefined || step.output === null) return "";
    if (typeof step.output === "string") return step.output;
    try {
      return JSON.stringify(step.output, null, 2);
    } catch {
      return String(step.output);
    }
  }, [step.output]);

  return (
    <AccordionItem
      title={
        <span className={styles.stepTitle}>
          <StatusIcon size={16} className={statusClass} />
          {displayToolName} #{index + 1}
        </span>
      }
    >
      {inputJson && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>{inputLabel}</div>
          <pre className={styles.json}>{inputJson}</pre>
        </div>
      )}
      {resultText && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>{outputLabel}</div>
          <pre className={styles.json}>{resultText}</pre>
        </div>
      )}
    </AccordionItem>
  );
});

function formatToolName(
  toolName: string,
  t: ReturnType<typeof useTranslation>["t"],
) {
  if (toolName.startsWith("__skill__:")) {
    const skillName = toolName.slice(10);
    return t("ui.useSkill", { skillName, defaultValue: `使用技能 ${skillName}` });
  }
  return toolName;
}

function ChainOfThoughtComponent({
  steps,
  isProcessing,
  currentToolName,
}: ChainOfThoughtProps) {
  const { t } = useTranslation("chatbot");
  const inputLabel = t("ui.stepInput");
  const outputLabel = t("ui.stepOutput");

  if (steps.length === 0 && !isProcessing) return null;

  return (
    <div className={styles.cot}>
      <div className={styles.label}>{t("ui.reasoningSteps")}</div>
      <Accordion size="sm" className={styles.accordion}>
        {steps.map((step, i) => (
          <ChainOfThoughtStep
            key={step.toolCallId}
            step={step}
            index={i}
            inputLabel={inputLabel}
            outputLabel={outputLabel}
            displayToolName={formatToolName(step.toolName, t)}
          />
        ))}

        {isProcessing && currentToolName && (
          <AccordionItem
            open
            title={
              <span className={styles.stepTitle}>
                <InProgress size={16} className={styles.processing} />
                {formatToolName(currentToolName, t)} #{steps.length + 1}
              </span>
            }
          >
            <div className={styles.processingText}>{t("ui.processing")}</div>
          </AccordionItem>
        )}
      </Accordion>
    </div>
  );
}

export const ChainOfThought = memo(ChainOfThoughtComponent);
