import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "@carbon/icons-react";
import { Button, SkeletonText } from "@carbon/react";
import type { ChatMessage } from "@/core/types/chatbot.types";
import type { ApprovalRequest } from "@/core/types/chatbot.types";
import { useChatScrollToBottom } from "../../hooks/useChatScrollToBottom";
import { MessageBubble } from "./MessageBubble";
import { HITLCard } from "./HITLCard";
import styles from "./MessageList.module.scss";

interface MessageListProps {
  messages: ChatMessage[];
  currentSessionId: string | null;
  isLoading?: boolean;
  pendingApproval: ApprovalRequest | null;
  onApprovalDecision: (decision: "approve" | "reject") => void;
}

export function MessageList({
  messages,
  currentSessionId,
  isLoading = false,
  pendingApproval,
  onApprovalDecision,
}: MessageListProps) {
  const { t } = useTranslation("chatbot");
  const containerRef = useRef<HTMLDivElement>(null);

  const displayMessages = useMemo(() => {
    if (messages.length === 0) {
      return [
        {
          id: "__welcome__",
          role: "assistant",
          content: t("ui.welcome"),
          timestamp: new Date(),
        } as ChatMessage,
      ];
    }
    return messages;
  }, [messages, t]);

  const { scrollToBottom, showScrollButton } = useChatScrollToBottom({
    containerRef,
    messages,
    currentSessionId,
    isLoading,
    pendingApproval,
  });

  return (
    <div className={styles.wrapper}>
      <div className={styles.list} ref={containerRef}>
        {isLoading ? (
          <MessageListSkeleton />
        ) : (
          displayMessages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))
        )}

        {!isLoading && pendingApproval && (
          <HITLCard request={pendingApproval} onDecision={onApprovalDecision} />
        )}
      </div>

      {showScrollButton && (
        <Button
          kind="secondary"
          size="sm"
          hasIconOnly
          renderIcon={ChevronDown}
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
        <span className={styles.skeletonAvatar} />
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
        <span className={styles.skeletonAvatar} />
      </div>
      <div className={styles.skeletonMessage}>
        <span className={styles.skeletonAvatar} />
        <div className={styles.skeletonContent}>
          <SkeletonText width="6rem" />
          <SkeletonText paragraph lineCount={4} />
        </div>
      </div>
    </div>
  );
}
