import { memo, useCallback, useMemo } from "react";
import { WatsonxAi, Copy, Checkmark } from "@carbon/icons-react";
import { IconButton } from "@carbon/react";
import { useTranslation } from "react-i18next";
import type { ChatMessage } from "@/core/types/chatbot.types";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import { useCopyText } from "@/shared/hooks/useCopyText";
import { normalizeChatMarkdownText } from "@/features/chatbot/utils/chatText";
import { ChainOfThought } from "./ChainOfThought";
import styles from "./MessageBubble.module.scss";

interface MessageBubbleProps {
  message: ChatMessage;
}

function MessageBubbleComponent({ message }: MessageBubbleProps) {
  const { t } = useTranslation("chatbot");
  const { isCopied, copy } = useCopyText();
  const isUser = message.role === "user";

  const thinkingSource = message.thinkingInfo?.thinking;
  const thinkingText = useMemo(
    () => (thinkingSource ? normalizeChatMarkdownText(thinkingSource) : ""),
    [thinkingSource],
  );
  const messageText = useMemo(
    () => (message.content ? normalizeChatMarkdownText(message.content) : ""),
    [message.content],
  );
  const timeLabel = useMemo(
    () =>
      message.timestamp.toLocaleTimeString("zh-TW", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    [message.timestamp],
  );

  const handleCopy = useCallback(() => {
    copy(message.content);
  }, [copy, message.content]);

  const hasCoT =
    !isUser &&
    ((message.toolExecutions && message.toolExecutions.length > 0) ||
      (message.todoItems && message.todoItems.length > 0));

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
            <span className={styles.time}>{timeLabel}</span>
          </div>
        )}

        {isUser && (
          <div className={styles.metaRight}>
            <span className={styles.time}>{timeLabel}</span>
          </div>
        )}

        {/* Thinking/Reasoning block */}
        {!isUser && thinkingText && (
          <details className={styles.thinking}>
            <summary>{t("ui.reasoning")}</summary>
            <div className={styles.thinkingContent}>
              <MarkdownRenderer
                enableHighlight
                enableMath
                className={`${styles.thinkingMarkdown} chat-thinking-markdown`}
              >
                {thinkingText}
              </MarkdownRenderer>
            </div>
          </details>
        )}

        {/* CoT steps */}
        {hasCoT && (
          <ChainOfThought
            steps={message.toolExecutions || []}
            todoItems={message.todoItems}
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

        {messageText && (
          <div className={styles.messageActions}>
            <IconButton
              kind="ghost"
              size="sm"
              label={isCopied ? t("ui.copied", "已複製") : t("ui.copyMessage", "複製訊息")}
              onClick={handleCopy}
              className={styles.copyButton}
            >
              {isCopied ? <Checkmark size={16} /> : <Copy size={16} />}
            </IconButton>
          </div>
        )}
      </div>
    </div>
  );
}

export const MessageBubble = memo(MessageBubbleComponent);
