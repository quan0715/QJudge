import { memo, useCallback } from "react";
import { Copy, Checkmark } from "@carbon/icons-react";
import { IconButton } from "@carbon/react";
import { useTranslation } from "react-i18next";
import type {
  CopilotMessageViewProps,
  CopilotReasoningPart,
  CopilotTextPart,
  CopilotToolPart,
} from "@copilot";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import { useCopyText } from "@/shared/hooks/useCopyText";
import { ChainOfThought } from "./ChainOfThought";
import styles from "./MessageBubble.module.scss";

function MessageBubbleComponent({ message }: CopilotMessageViewProps) {
  const { t } = useTranslation("chatbot");
  const { isCopied, copy } = useCopyText();
  const isUser = message.role === "user";

  const messageText = message.parts
    .filter((part): part is CopilotTextPart => part.type === "text")
    .map((part) => part.text)
    .join("");
  const thinkingText = message.parts
    .filter((part): part is CopilotReasoningPart => part.type === "reasoning")
    .map((part) => part.text)
    .join("");
  const toolParts = message.parts.filter(
    (part): part is CopilotToolPart => part.type === "tool",
  );
  const activeToolPart = [...toolParts]
    .reverse()
    .find(
      (part) =>
        part.state === "input-streaming" || part.state === "input-ready",
    );
  const completedToolParts = activeToolPart
    ? toolParts.filter((part) => part.toolCallId !== activeToolPart.toolCallId)
    : toolParts;
  const isThinking =
    message.role === "assistant" &&
    message.parts.some(
      (part) => part.type === "reasoning" && part.state === "streaming",
    );

  const handleCopy = useCallback(() => {
    copy(messageText);
  }, [copy, messageText]);

  // Todo list has moved to SessionBadges (above the composer), so CoT is
  // only rendered when the message has actual tool-call transparency data.
  const hasCoT = !isUser && toolParts.length > 0;

  return (
    <div className={`${styles.bubble} ${isUser ? styles.user : styles.ai}`}>
      <div className={styles.content}>
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
            steps={completedToolParts}
            isProcessing={activeToolPart !== undefined}
            currentToolName={activeToolPart?.toolName}
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
          !isUser && isThinking && (
            <span className={styles.thinkingDots}>
              <span />
              <span />
              <span />
            </span>
          )
        )}

        {/* Show thinking dots after content when isThinking is true — covers the
            gap between HITL resume and the first SSE event from the resumed run. */}
        {!isUser && messageText && isThinking && (
          <span className={styles.thinkingDots}>
            <span />
            <span />
            <span />
          </span>
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
