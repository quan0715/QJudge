import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown } from "@carbon/icons-react";
import { Button, SkeletonText } from "@carbon/react";
import {
  useCopilotScroll,
  type CopilotMessage,
  type CopilotMessageListSlotProps,
} from "@copilot";
import styles from "./MessageList.module.scss";

export function MessageList({
  messages,
  activeSessionId,
  activeSession,
  run,
  messageComponent: MessageComponent,
}: CopilotMessageListSlotProps) {
  const { t } = useTranslation("chatbot");
  const containerRef = useRef<HTMLDivElement>(null);
  const isLoading = activeSession.status === "loading";

  const displayMessages = useMemo(() => {
    if (messages.length === 0) {
      return [
        {
          id: "__welcome__",
          role: "assistant",
          parts: [{ type: "text", text: t("ui.welcome") }],
          createdAt: new Date(),
        } satisfies CopilotMessage,
      ];
    }
    return messages;
  }, [messages, t]);

  const interactionRevision =
    run.status === "awaiting-approval" || run.status === "awaiting-answer"
      ? `${run.status}:${run.run.id}`
      : null;
  const { scrollToBottom, showScrollButton } = useCopilotScroll({
    containerRef,
    messages,
    activeSessionId,
    loading: isLoading,
    interactionRevision,
  });

  return (
    <div className={styles.wrapper}>
      <div className={styles.list} ref={containerRef}>
        {isLoading ? (
          <MessageListSkeleton />
        ) : (
          displayMessages.map((msg) => (
            <MessageComponent key={msg.id} message={msg} />
          ))
        )}
      </div>

      {showScrollButton && (
        <Button
          kind="secondary"
          size="sm"
          hasIconOnly
          renderIcon={ArrowDown}
          iconDescription={t("ui.scrollToBottom")}
          tooltipPosition="left"
          className={styles.scrollButton}
          onClick={() => scrollToBottom("smooth")}
        />
      )}
    </div>
  );
}

function MessageListSkeleton() {
  return (
    <div className={styles.skeletonStack} aria-hidden="true">
      <div className={styles.skeletonMessage}>
        <div className={styles.skeletonContent}>
          <SkeletonText width="7rem" />
          <SkeletonText paragraph lineCount={3} />
        </div>
      </div>
      <div className={`${styles.skeletonMessage} ${styles.skeletonMessageRight}`}>
        <div className={styles.skeletonContent}>
          <SkeletonText width="5rem" />
          <SkeletonText paragraph lineCount={2} />
        </div>
      </div>
      <div className={styles.skeletonMessage}>
        <div className={styles.skeletonContent}>
          <SkeletonText width="6rem" />
          <SkeletonText paragraph lineCount={4} />
        </div>
      </div>
    </div>
  );
}
