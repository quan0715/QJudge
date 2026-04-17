import { memo, useMemo } from "react";
import { Accordion, AccordionItem } from "@carbon/react";
import { Checkmark, Warning, InProgress } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { RunTodoItem, ToolInfo } from "@/core/types/chatbot.types";
import styles from "./ChainOfThought.module.scss";

interface ChainOfThoughtProps {
  steps: ToolInfo[];
  todoItems?: RunTodoItem[];
  isProcessing: boolean;
  currentToolName?: string;
}

function getTodoStatusIcon(item: RunTodoItem) {
  if (item.status === "success") {
    return <Checkmark size={16} className={styles.success} />;
  }
  if (item.status === "fail") {
    return <Warning size={16} className={styles.failure} />;
  }
  if (item.status === "in_progress") {
    return <InProgress size={16} className={styles.processing} />;
  }
  return <InProgress size={16} className={styles.pending} />;
}

function getTodoSummaryStatus(todoItems: RunTodoItem[]) {
  if (todoItems.some((item) => item.status === "fail")) return "fail";
  if (todoItems.some((item) => item.status === "in_progress")) return "in_progress";
  if (todoItems.length > 0 && todoItems.every((item) => item.status === "success")) return "success";
  return "pending";
}

interface StepProps {
  step: ToolInfo;
  index: number;
  inputLabel: string;
  outputLabel: string;
}

const ChainOfThoughtStep = memo(function ChainOfThoughtStep({
  step,
  index,
  inputLabel,
  outputLabel,
}: StepProps) {
  const isDone = step.result !== undefined || step.isError;
  const isFailed = step.isError;
  const StatusIcon = isFailed ? Warning : isDone ? Checkmark : InProgress;
  const statusClass = isFailed
    ? styles.failure
    : isDone
      ? styles.success
      : styles.processing;

  // Expensive JSON serialization is cached per-step; only re-runs when
  // the underlying inputData/result reference changes. This is critical
  // because previously-completed steps would re-stringify on every SSE
  // delta applied to the parent message list.
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
          {step.toolName} #{index + 1}
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

function ChainOfThoughtComponent({
  steps,
  todoItems = [],
  isProcessing,
  currentToolName,
}: ChainOfThoughtProps) {
  const { t } = useTranslation("chatbot");
  const inputLabel = t("ui.stepInput");
  const outputLabel = t("ui.stepOutput");
  const todoSummaryStatus = getTodoSummaryStatus(todoItems);

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
          />
        ))}

        {isProcessing && currentToolName && (
          <AccordionItem
            open
            title={
              <span className={styles.stepTitle}>
                <InProgress size={16} className={styles.processing} />
                {currentToolName} #{steps.length + 1}
              </span>
            }
          >
            <div className={styles.processingText}>{t("ui.processing")}</div>
          </AccordionItem>
        )}

        {todoItems.length > 0 && (
          <AccordionItem
            open={todoSummaryStatus === "in_progress" || todoSummaryStatus === "pending"}
            title={
              <span className={styles.stepTitle}>
                {getTodoStatusIcon({
                  id: "todo-summary",
                  label: "",
                  status: todoSummaryStatus,
                })}
                {t("ui.todoList", "待辦清單")}
              </span>
            }
          >
            <div className={styles.todoList}>
              {todoItems.map((item) => (
                <div key={item.id} className={styles.todoItem}>
                  {getTodoStatusIcon(item)}
                  <span className={styles.todoLabel}>{item.label}</span>
                </div>
              ))}
            </div>
          </AccordionItem>
        )}
      </Accordion>
    </div>
  );
}

export const ChainOfThought = memo(ChainOfThoughtComponent);
