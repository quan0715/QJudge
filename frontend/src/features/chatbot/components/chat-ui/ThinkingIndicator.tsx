import { useTranslation } from "react-i18next";
import { Pen } from "@carbon/icons-react";
import type { CopilotMessage } from "@copilot";
import styles from "./ThinkingIndicator.module.scss";

const INK_PATH = "M 8 27 C 10 23, 12 23, 13 26 S 17 29, 19 25 S 22 23, 24 25";

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
      <span className={styles.orb} aria-hidden="true">
        <span className={styles.halo} />
        <svg className={styles.paper} viewBox="0 0 40 40" focusable="false">
          <path className={styles.ink} d={INK_PATH} pathLength="1" />
        </svg>
        <span className={styles.penMotion} style={{ offsetPath: `path("${INK_PATH}")` }}>
          <span className={styles.penLift}>
            <Pen size={22} className={styles.pen} />
          </span>
        </span>
      </span>
      <span className={styles.label}>
        {t(executing ? "ui.activityExecuting" : "ui.activityWaiting")}
      </span>
    </div>
  );
}
