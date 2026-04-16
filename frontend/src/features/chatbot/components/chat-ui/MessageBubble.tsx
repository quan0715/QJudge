import type { ChatMessage } from "@/core/types/chatbot.types";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import { ChainOfThought } from "./ChainOfThought";
import styles from "./MessageBubble.module.scss";

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={`${styles.bubble} ${isUser ? styles.user : styles.ai}`}>
      {!isUser && (
        <div className={styles.avatar} aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 32 32" fill="currentColor">
            <path d="M16 2a14 14 0 1 0 14 14A14 14 0 0 0 16 2Zm0 5a4.5 4.5 0 1 1-4.5 4.5A4.5 4.5 0 0 1 16 7Zm8 17.92a11.93 11.93 0 0 1-16 0v-.58A5.2 5.2 0 0 1 13 19h6a5.2 5.2 0 0 1 5 5.34Z" />
          </svg>
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
        {!isUser && message.thinkingInfo?.thinking && (
          <details className={styles.thinking}>
            <summary>推理過程</summary>
            <div className={styles.thinkingContent}>
              {message.thinkingInfo.thinking}
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
        {message.content ? (
          isUser ? (
            <p className={styles.text}>{message.content}</p>
          ) : (
            <MarkdownRenderer
              enableHighlight
              enableCopy
              enableMath
              className={styles.markdown}
            >
              {message.content}
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
      </div>
    </div>
  );
}
