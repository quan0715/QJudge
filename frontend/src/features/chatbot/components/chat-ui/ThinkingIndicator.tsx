import { useTranslation } from "react-i18next";
import { ThinkingPen } from "@/shared/ui/ThinkingPen";
import type { CopilotMessage } from "@copilot";
import styles from "./ThinkingIndicator.module.scss";

export function ThinkingIndicator({
  messages = [],
}: {
  messages?: readonly CopilotMessage[];
}) {
  const { t } = useTranslation("chatbot");
  const latest = messages.at(-1);
  const executing = latest?.role === "assistant" && latest.parts.some(
    (part) => part.type === "tool" && !part.parentToolCallId &&
      (part.state === "input-streaming" || part.state === "input-ready"),
  );

  return (
    <div className={styles.indicator} role="status" aria-live="polite" aria-atomic="true">
      <ThinkingPen />
      <span className={styles.label}>
        {t(executing ? "ui.activityExecuting" : "ui.activityWaiting")}
      </span>
    </div>
  );
}
