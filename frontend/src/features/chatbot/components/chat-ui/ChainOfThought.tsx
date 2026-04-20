import { memo, useMemo } from "react";
import { Accordion, AccordionItem } from "@carbon/react";
import { Checkmark, Warning, InProgress } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { RunTodoItem, ToolInfo } from "@/core/types/chatbot.types";
import styles from "./ChainOfThought.module.scss";

interface ChainOfThoughtProps {
  steps: ToolInfo[];
  // Kept on the type for compatibility with existing callers, but the todo
  // block has moved to SessionBadges (above the composer). CoT now focuses
  // on raw tool-call transparency only.
  todoItems?: RunTodoItem[];
  isProcessing: boolean;
  currentToolName?: string;
}

interface StepProps {
  step: ToolInfo;
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
  const isDone = step.result !== undefined || step.isError;
  const isFailed = step.isError;
  const StatusIcon = isFailed ? Warning : isDone ? Checkmark : InProgress;
  const statusClass = isFailed
    ? styles.failure
    : isDone
      ? styles.success
      : styles.processing;

  const inputJson = useMemo(() => {
    if (step.inputData === undefined || step.inputData === null) return "";
    try {
      return JSON.stringify(step.inputData, null, 2);
    } catch {
      return String(step.inputData);
    }
  }, [step.inputData]);

  const resultText = useMemo(() => {
    if (step.result === undefined || step.result === null) return "";
    if (typeof step.result === "string") return step.result;
    try {
      return JSON.stringify(step.result, null, 2);
    } catch {
      return String(step.result);
    }
  }, [step.result]);

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

function formatToolName(toolName: string, t: any) {
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
            key={step.toolCallId || i}
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
