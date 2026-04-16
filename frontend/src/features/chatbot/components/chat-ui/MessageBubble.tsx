import { WatsonxAi } from "@carbon/icons-react";
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
        {!isUser && message.thinkingInfo?.thinking && (
          <details className={styles.thinking}>
            <summary>推理過程</summary>
            <div className={styles.thinkingContent}>
              <MarkdownRenderer enableHighlight enableMath>
                {message.thinkingInfo.thinking}
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
