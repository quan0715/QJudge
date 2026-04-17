import { useMemo, useRef, useEffect, useState, useCallback, useLayoutEffect } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "@carbon/icons-react";
import { Button, SkeletonText } from "@carbon/react";
import type { ChatMessage } from "@/core/types/chatbot.types";
import type { ApprovalRequest } from "@/core/types/chatbot.types";
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
  const endRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

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

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = containerRef.current;
    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    });
  }, []);

  const scheduleScrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    requestAnimationFrame(() => {
      scrollToBottom(behavior);
      requestAnimationFrame(() => scrollToBottom(behavior));
    });
  }, [scrollToBottom]);

  // Handle scroll event to show/hide "Scroll to Bottom" button
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    // Show button if user scrolls up more than 300px from the bottom
    const isFarFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight > 300;
    setShowScrollButton(isFarFromBottom);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener("scroll", handleScroll);
      return () => container.removeEventListener("scroll", handleScroll);
    }
  }, [handleScroll]);

  // Auto-scroll to bottom when session changes
  useLayoutEffect(() => {
    scheduleScrollToBottom("auto");
  }, [currentSessionId, isLoading, scheduleScrollToBottom]);

  // Auto-scroll to bottom when new messages arrive or content changes (if already near bottom)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 150;

    if (isNearBottom) {
      scheduleScrollToBottom("smooth");
    }
  }, [messages, pendingApproval, scheduleScrollToBottom]);

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

        <div ref={endRef} />
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
