import { WatsonxAi } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ChatMessage } from "@/core/types/chatbot.types";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import { normalizeChatMarkdownText } from "@/features/chatbot/utils/chatText";
import { ChainOfThought } from "./ChainOfThought";
import styles from "./MessageBubble.module.scss";

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const { t } = useTranslation("chatbot");
  const isUser = message.role === "user";
  const thinkingText = message.thinkingInfo?.thinking
    ? normalizeChatMarkdownText(message.thinkingInfo.thinking)
    : "";
  const messageText = message.content
    ? normalizeChatMarkdownText(message.content)
    : "";

  return (
    <div className={`${styles.bubble} ${isUser ? styles.user : styles.ai}`}>
      {!isUser && (
        <div className={styles.avatar} aria-hidden="true">
          <WatsonxAi size={20} />
        </div>
      )}

      <div className={styles.content}>
        {!isUser && (
          <div className={styles.meta}>
            <span className={styles.name}>QJudge AI</span>
            <span className={styles.time}>
              {message.timestamp.toLocaleTimeString("zh-TW", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        )}

        {isUser && (
          <div className={styles.metaRight}>
            <span className={styles.time}>
              {message.timestamp.toLocaleTimeString("zh-TW", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        )}

        {/* Thinking/Reasoning block */}
        {!isUser && thinkingText && (
          <details className={styles.thinking}>
            <summary>{t("ui.reasoning")}</summary>
            <div className={styles.thinkingContent}>
              <MarkdownRenderer enableHighlight enableMath className={styles.thinkingMarkdown}>
                {thinkingText}
              </MarkdownRenderer>
            </div>
          </details>
        )}

        {/* CoT steps */}
        {!isUser && message.toolExecutions && message.toolExecutions.length > 0 && (
          <ChainOfThought
            steps={message.toolExecutions}
            isProcessing={!!message.toolName}
            currentToolName={message.toolName}
          />
        )}

        {/* Message content */}
        {messageText ? (
          isUser ? (
            <p className={styles.text}>{messageText}</p>
          ) : (
            <MarkdownRenderer
              enableHighlight
              enableCopy
              enableMath
              className={styles.markdown}
            >
              {messageText}
            </MarkdownRenderer>
          )
        ) : (
          !isUser && message.isThinking && (
            <span className={styles.thinkingDots}>
              <span />
              <span />
              <span />
            </span>
          )
        )}

        {!isUser && message.runStatus === "queued" && (
          <span className={styles.runStatus}>已排入佇列</span>
        )}
        {!isUser && message.runStatus === "cancelled" && (
          <span className={styles.runStatus}>已停止</span>
        )}
        {!isUser && message.runStatus === "failed" && (
          <span className={styles.runStatus}>任務失敗</span>
        )}
      </div>
    </div>
  );
}
