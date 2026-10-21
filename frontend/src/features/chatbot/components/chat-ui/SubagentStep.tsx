import { memo } from "react";
import { Accordion, AccordionItem, ListItem, UnorderedList } from "@carbon/react";
import { useTranslation } from "react-i18next";
import type { CopilotToolPart } from "@copilot";
import { ChainOfThoughtStep, StepStatusIcon } from "./ChainOfThoughtStep";
import { formatJson, subagentTitle } from "./chainOfThoughtFormat";
import styles from "./ChainOfThought.module.scss";

function todoLabels(todos: readonly unknown[] | undefined): string[] {
  return (todos ?? [])
    .map((todo) => (todo as { label?: unknown }).label)
    .filter((label): label is string => typeof label === "string" && label.length > 0);
}

interface SubagentStepProps {
  step: CopilotToolPart;
  childSteps: readonly CopilotToolPart[];
  open?: boolean;
}

export const SubagentStep = memo(function SubagentStep({
  step,
  childSteps,
  open = false,
}: SubagentStepProps) {
  const { t } = useTranslation("chatbot");
  const todos = todoLabels(step.activity?.todos);
  const result = formatJson(step.output);
  const isRunning = step.state === "input-streaming" || step.state === "input-ready";

  return (
    <AccordionItem
      open={open}
      title={
        <span className={styles.stepTitle}>
          <StepStatusIcon step={step} />
          <span className={styles.subagentLabel}>{t("ui.subagent")}</span>
          {subagentTitle(step, step.toolName)}
        </span>
      }
    >
      {todos.length > 0 && (
        <UnorderedList className={styles.subagentTodos}>
          {todos.map((label) => (
            <ListItem key={label}>{label}</ListItem>
          ))}
        </UnorderedList>
      )}
      {childSteps.length > 0 && (
        <Accordion size="sm">
          {childSteps.map((child, i) => (
            <ChainOfThoughtStep key={child.toolCallId} step={child} index={i} />
          ))}
        </Accordion>
      )}
      {step.activity?.text && <div className={styles.subagentText}>{step.activity.text}</div>}
      {isRunning && <div className={styles.processingText}>{t("ui.subagentRunning")}</div>}
      {result && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>{t("ui.subagentResult")}</div>
          <div className={styles.subagentText}>{result}</div>
        </div>
      )}
    </AccordionItem>
  );
});
