import type { FC, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { InlineLoading } from "@carbon/react";
import type { ChatMessage } from "@/core/types/chatbot.types";
import { MessageBubble } from "./MessageBubble";
import styles from "../ChatbotWidget.module.scss";

export interface MessageListProps {
  messages: ChatMessage[];
  isLoading?: boolean;
  isStreaming?: boolean;
  welcomeScreen?: ReactNode;
}

/**
 * 訊息列表元件
 * 可捲動的訊息區域，新訊息自動捲動到底部
 */
export const MessageList: FC<MessageListProps> = ({
  messages,
  isLoading = false,
  isStreaming = false,
  welcomeScreen,
}) => {
  const listEndRef = useRef<HTMLDivElement>(null);
  const scrollFrameRef = useRef<number | null>(null);

  // 新訊息時自動捲動到底部
  useEffect(() => {
    if (!listEndRef.current) return;
    if (scrollFrameRef.current !== null) return;

    scrollFrameRef.current = requestAnimationFrame(() => {
      listEndRef.current?.scrollIntoView({
        behavior: isStreaming ? "auto" : "smooth",
      });
      scrollFrameRef.current = null;
    });

    return () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [messages, isLoading, isStreaming]);

  // 判斷最後一則訊息是否為正在串流的 assistant 訊息
  const lastMessage = messages[messages.length - 1];
  const isLastMessageStreaming =
    isStreaming && lastMessage?.role === "assistant";

  // 顯示歡迎畫面（當沒有訊息且不在載入中時）
  const showWelcome = messages.length === 0 && !isLoading && welcomeScreen;

  return (
    <div className={styles.messageList}>
      {showWelcome ? (
        welcomeScreen
      ) : (
        <>
          {messages.map((message, index) => {
            const isLastAssistant =
              index === messages.length - 1 && message.role === "assistant";
            return (
              <MessageBubble
                key={message.id}
                message={message}
                isTyping={isLastAssistant && isStreaming}
              />
            );
          })}
          {isLoading && !isLastMessageStreaming && (
            <div className={styles.loadingIndicator}>
              <InlineLoading description="AI 思考中..." status="active" />
            </div>
          )}
        </>
      )}
      <div ref={listEndRef} />
    </div>
  );
};

export default MessageList;
