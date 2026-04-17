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

export function ChainOfThought({
  steps,
  todoItems = [],
  isProcessing,
  currentToolName,
}: ChainOfThoughtProps) {
  const { t } = useTranslation("chatbot");
  const todoSummaryStatus = getTodoSummaryStatus(todoItems);
  return (
    <div className={styles.cot}>
      <div className={styles.label}>{t("ui.reasoningSteps")}</div>
      <Accordion size="sm" className={styles.accordion}>
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

        {steps.map((step, i) => {
          const isDone = step.result !== undefined || step.isError;
          const isFailed = step.isError;
          const StatusIcon = isFailed ? Warning : isDone ? Checkmark : InProgress;
          const statusClass = isFailed ? styles.failure : isDone ? styles.success : styles.processing;

          return (
            <AccordionItem
              key={step.toolCallId || i}
              title={
                <span className={styles.stepTitle}>
                  <StatusIcon size={16} className={statusClass} />
                  {step.toolName} #{i + 1}
                </span>
              }
            >
              {step.inputData && (
                <div className={styles.section}>
                  <div className={styles.sectionLabel}>{t("ui.stepInput")}</div>
                  <pre className={styles.json}>
                    {JSON.stringify(step.inputData, null, 2)}
                  </pre>
                </div>
              )}
              {step.result && (
                <div className={styles.section}>
                  <div className={styles.sectionLabel}>{t("ui.stepOutput")}</div>
                  <pre className={styles.json}>
                    {typeof step.result === "string"
                      ? step.result
                      : JSON.stringify(step.result, null, 2)}
                  </pre>
                </div>
              )}
            </AccordionItem>
          );
        })}

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
      </Accordion>
    </div>
  );
}
