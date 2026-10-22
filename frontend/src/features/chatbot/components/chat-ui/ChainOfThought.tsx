import { memo, useMemo } from "react";
import { Accordion, AccordionItem } from "@carbon/react";
import { InProgress } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { CopilotToolPart } from "@copilot";
import { ChainOfThoughtStep } from "./ChainOfThoughtStep";
import { formatToolName } from "./chainOfThoughtFormat";
import { SubagentStep } from "./SubagentStep";
import styles from "./ChainOfThought.module.scss";

const SUBAGENT_TOOL_NAME = "task";

interface ChainOfThoughtProps {
  /** Finished top-level steps plus every sub-agent step (any state). */
  steps: readonly CopilotToolPart[];
  isProcessing: boolean;
  currentToolName?: string;
  /** The top-level step still running, if any. */
  activeStep?: CopilotToolPart;
}

function groupChildren(steps: readonly CopilotToolPart[]) {
  const children = new Map<string, CopilotToolPart[]>();
  const topLevel: CopilotToolPart[] = [];
  for (const step of steps) {
    if (step.parentToolCallId) {
      const group = children.get(step.parentToolCallId) ?? [];
      group.push(step);
      children.set(step.parentToolCallId, group);
    } else {
      topLevel.push(step);
    }
  }
  return { topLevel, children };
}

function ChainOfThoughtComponent({
  steps,
  isProcessing,
  currentToolName,
  activeStep,
}: ChainOfThoughtProps) {
  const { t } = useTranslation("chatbot");
  const { topLevel, children } = useMemo(() => groupChildren(steps), [steps]);
  const activeName = activeStep?.toolName ?? currentToolName;
  const activeIsSubagent = activeStep?.toolName === SUBAGENT_TOOL_NAME;

  if (topLevel.length === 0 && !isProcessing) return null;

  return (
    <div className={styles.cot}>
      <div className={styles.label}>{t("ui.reasoningSteps")}</div>
      <Accordion size="sm">
        {topLevel.map((step, i) =>
          step.toolName === SUBAGENT_TOOL_NAME ? (
            <SubagentStep
              key={step.toolCallId}
              step={step}
              childSteps={children.get(step.toolCallId) ?? []}
            />
          ) : (
            <ChainOfThoughtStep key={step.toolCallId} step={step} index={i} />
          ),
        )}

        {isProcessing && activeStep && activeIsSubagent && (
          <SubagentStep
            open
            step={activeStep}
            childSteps={children.get(activeStep.toolCallId) ?? []}
          />
        )}

        {isProcessing && activeName && !activeIsSubagent && (
          <AccordionItem
            open
            title={
              <span className={styles.stepTitle}>
                <InProgress size={16} className={styles.processing} />
                {formatToolName(activeName, t)} #{topLevel.length + 1}
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
