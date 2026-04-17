import { useMemo, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { ChatMessage } from "@/core/types/chatbot.types";
import type { ApprovalRequest } from "@/core/types/chatbot.types";
import { MessageBubble } from "./MessageBubble";
import { HITLCard } from "./HITLCard";
import styles from "./MessageList.module.scss";

interface MessageListProps {
  messages: ChatMessage[];
  pendingApproval: ApprovalRequest | null;
  onApprovalDecision: (decision: "approve" | "reject") => void;
}

export function MessageList({ messages, pendingApproval, onApprovalDecision }: MessageListProps) {
  const { t } = useTranslation("chatbot");
  const endRef = useRef<HTMLDivElement>(null);
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

  // Auto-scroll to bottom when new messages arrive or content changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 150;

    if (isNearBottom) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, pendingApproval]);

  return (
    <div className={styles.list} ref={containerRef}>
      {displayMessages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}

      {pendingApproval && (
        <HITLCard request={pendingApproval} onDecision={onApprovalDecision} />
      )}

      <div ref={endRef} />
    </div>
  );
}
