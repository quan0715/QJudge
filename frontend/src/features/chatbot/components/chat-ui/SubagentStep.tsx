import { memo } from "react";
import { Accordion, AccordionItem, ListItem, UnorderedList } from "@carbon/react";
import { Bot } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { CopilotToolPart } from "@copilot";
import { ChainOfThoughtStep, StepStatusIcon } from "./ChainOfThoughtStep";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import { formatSubagentResult, subagentTitle } from "./chainOfThoughtFormat";
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
  const result = formatSubagentResult(step.output);
  const isRunning = step.state === "input-streaming" || step.state === "input-ready";
  const name = subagentTitle(step, t("ui.subagent"));

  return (
    <AccordionItem
      open={open}
      title={
        <span className={styles.stepTitle}>
          <StepStatusIcon step={step} />
          <Bot size={16} className={styles.subagentIcon} aria-label={t("ui.subagent")} />
          <span className={styles.stepName} title={name}>
            {name}
          </span>
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
      {step.activity?.text && <MarkdownRenderer enableMath className={styles.subagentText}>{step.activity.text}</MarkdownRenderer>}
      {isRunning && <div className={styles.processingText}>{t("ui.subagentRunning")}</div>}
      {result && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>{t("ui.subagentResult")}</div>
          <MarkdownRenderer enableMath className={styles.subagentText}>{result}</MarkdownRenderer>
        </div>
      )}
    </AccordionItem>
  );
});
