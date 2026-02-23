import type { FC } from "react";
import { InlineLoading, Accordion, AccordionItem, Tag, CodeSnippet } from "@carbon/react";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import type { ChatMessage } from "@/core/types/chatbot.types";
import { getCurrentStage } from "@/core/types/chatbot.types";
import { AgentAvatar } from "./AgentAvatar";
import styles from "../ChatbotWidget.module.scss";

export interface MessageBubbleProps {
  message: ChatMessage;
  isTyping?: boolean;
}

/**
 * 單一訊息泡泡元件
 * user 訊息：右對齊, 主題色背景
 * assistant 訊息：左對齊, 淺色背景
 */
export const MessageBubble: FC<MessageBubbleProps> = ({
  message,
  isTyping = false,
}) => {
  const isUser = message.role === "user";

  // 顯示工具調用狀態
  const renderToolStatus = () => {
    if (message.toolName) {
      return (
        <div className={styles.toolStatus}>
          <InlineLoading description={`執行工具：${message.toolName}`} />
        </div>
      );
    }
    return null;
  };

  // 顯示思考中狀態
  const renderThinkingStatus = () => {
    if (message.isThinking && !message.content) {
      return (
        <div className={styles.thinkingStatus}>
          <span className={styles.breathingDot}></span>
          思考中...
        </div>
      );
    }
    return null;
  };

  // 過濾掉 background_information 標籤
  const filterBackgroundInfo = (content: string): string => {
    // 移除 <background_information>...</background_information> 及其內容
    return content.replace(/<background_information>[\s\S]*?<\/background_information>\s*/g, "").trim();
  };

  // 清理 AI 訊息中的多餘空行 - 保留段落間距（兩個換行），壓縮三個以上
  const cleanupExcessiveEmptyLines = (content: string): string => {
    // 將三個以上連續換行壓縮為兩個（保留 markdown 段落分隔）
    content = content.replace(/\n{3,}/g, "\n\n");
    return content.trim();
  };

  // 顯示思考過程（可折疊）
  const renderThinkingBlock = () => {
    if (!message.thinkingInfo) return null;

    return (
      <Accordion className={styles.thinkingBlock}>
        <AccordionItem title="思考過程">
          <div className={styles.thinkingContent}>
            {message.thinkingInfo.thinking}
          </div>
        </AccordionItem>
      </Accordion>
    );
  };

  // 顯示工具執行日誌（可折疊）
  const renderToolExecutions = () => {
    if (!message.toolExecutions?.length) return null;

    return (
      <Accordion className={styles.toolExecutionsBlock}>
        <AccordionItem title={`工具執行記錄 (${message.toolExecutions.length})`}>
          {message.toolExecutions.map((tool, idx) => (
            <div key={idx} className={styles.toolExecution}>
              <div className={styles.toolHeader}>
                <Tag type={tool.isError ? "red" : "green"}>
                  {tool.toolName}
                </Tag>
                {tool.durationMs && (
                  <span className={styles.duration}>{tool.durationMs}ms</span>
                )}
              </div>

              {/* 輸入參數 */}
              {tool.inputData && (
                <div className={styles.toolInputData}>
                  <strong>輸入:</strong>
                  <CodeSnippet type="multi" feedback="Copied!">
                    {JSON.stringify(tool.inputData, null, 2)}
                  </CodeSnippet>
                </div>
              )}

              {/* 執行結果 */}
              {tool.result && (
                <div className={styles.toolResultData}>
                  <strong>結果:</strong>
                  <CodeSnippet type="multi" feedback="Copied!">
                    {typeof tool.result === "string"
                      ? tool.result
                      : JSON.stringify(tool.result, null, 2)}
                  </CodeSnippet>
                </div>
              )}
            </div>
          ))}
        </AccordionItem>
      </Accordion>
    );
  };

  // 顯示階段標籤（從 toolExecutions 推斷）
  const renderStageIndicator = () => {
    const currentStage = getCurrentStage(message.toolExecutions);
    if (!currentStage) return null;

    return (
      <div className={styles.stageIndicator}>
        <Tag type="purple">{currentStage}</Tag>
      </div>
    );
  };

  // 顯示內容
  const renderContent = () => {
    if (!message.content && (message.isThinking || message.toolName)) {
      return null; // 等待內容
    }

    if (isUser) {
      // 用戶訊息：純文字，過濾掉 background_information
      const cleanContent = filterBackgroundInfo(message.content);
      return (
        <>
          {cleanContent}
          {isTyping && <span className={styles.typingCursor}>▍</span>}
        </>
      );
    } else {
      // AI 訊息：清理多餘空行後進行 Markdown 渲染
      const cleanedContent = cleanupExcessiveEmptyLines(message.content);
      return (
        <>
          <MarkdownRenderer
            enableHighlight
            enableCopy
            enableMath
            allowRawHtml={false}
            className={styles.markdownContent}
          >
            {cleanedContent}
          </MarkdownRenderer>
          {isTyping && <span className={styles.typingCursor}>▍</span>}
        </>
      );
    }
  };

  return (
    <div
      className={`${styles.messageBubble} ${isUser ? styles.user : styles.assistant}`}
    >
      {!isUser && message.content && <AgentAvatar size="md" className={styles.messageAvatar} />}
      <div className={styles.messageContentWrapper}>
        <div className={styles.bubbleContent}>
          {renderStageIndicator()}
          {renderThinkingBlock()}
          {renderToolExecutions()}
          {renderThinkingStatus()}
          {renderToolStatus()}
          {renderContent()}
        </div>
        <div className={styles.bubbleTime}>
          {message.timestamp.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
