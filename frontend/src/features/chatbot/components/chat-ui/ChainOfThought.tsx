import { Accordion, AccordionItem } from "@carbon/react";
import { Checkmark, Warning, InProgress } from "@carbon/icons-react";
import type { ToolInfo } from "@/core/types/chatbot.types";
import styles from "./ChainOfThought.module.scss";

interface ChainOfThoughtProps {
  steps: ToolInfo[];
  isProcessing: boolean;
  currentToolName?: string;
}

export function ChainOfThought({ steps, isProcessing, currentToolName }: ChainOfThoughtProps) {
  return (
    <div className={styles.cot}>
      <div className={styles.label}>推理步驟</div>
      <Accordion size="sm" className={styles.accordion}>
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
                  <div className={styles.sectionLabel}>輸入</div>
                  <pre className={styles.json}>
                    {JSON.stringify(step.inputData, null, 2)}
                  </pre>
                </div>
              )}
              {step.result && (
                <div className={styles.section}>
                  <div className={styles.sectionLabel}>輸出</div>
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
            <div className={styles.processingText}>處理中…</div>
          </AccordionItem>
        )}
      </Accordion>
    </div>
  );
}
