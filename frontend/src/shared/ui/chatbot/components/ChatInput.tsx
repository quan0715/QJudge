import type { FC, KeyboardEvent } from "react";
import { useState, useCallback, useRef, useEffect } from "react";
import { IconButton, Dropdown, Tag } from "@carbon/react";
import { ArrowUp, StopFilled, Information } from "@carbon/icons-react";
import type { BackgroundInformation, ChatModel } from "@/core/types/chatbot.types";
import styles from "./ChatInput.module.scss";

const AVAILABLE_MODELS: { id: ChatModel; label: string }[] = [
  { id: "claude-sonnet", label: "Sonnet 4.6" },
  { id: "claude-haiku", label: "Haiku 4.5" },
  { id: "claude-opus", label: "Opus 4.6" },
];
const LAST_MODEL_KEY = "chatbot_last_model";
const DEFAULT_MODEL: ChatModel = "claude-sonnet";

function resolveInitialModel(): ChatModel {
  if (typeof window === "undefined") {
    return DEFAULT_MODEL;
  }
  const saved = localStorage.getItem(LAST_MODEL_KEY);
  if (
    saved === "claude-sonnet" ||
    saved === "claude-haiku" ||
    saved === "claude-opus"
  ) {
    return saved;
  }
  return DEFAULT_MODEL;
}

export interface ChatInputProps {
  onSend: (message: string, modelId: ChatModel) => void;
  onStop?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  placeholder?: string;
  problemContext?: {
    id: number | string;
    title: string;
  } | null;
  backgroundInfo?: BackgroundInformation | null;
  hasMessages?: boolean;
}

/**
 * 聊天輸入框元件
 * 支援 Enter 送出，Shift+Enter 換行
 * 包含模型選擇器和發送按鈕
 */
export const ChatInput: FC<ChatInputProps> = ({
  onSend,
  onStop,
  disabled = false,
  isStreaming = false,
  placeholder = "請說明您想出題或修改題目的方向...",
  problemContext = null,
  backgroundInfo = null,
  hasMessages = false,
}) => {
  const [value, setValue] = useState("");
  const [selectedModelId, setSelectedModelId] =
    useState<ChatModel>(resolveInitialModel);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectedModel =
    AVAILABLE_MODELS.find((m) => m.id === selectedModelId) ??
    AVAILABLE_MODELS[0];

  useEffect(() => {
    try {
      localStorage.setItem(LAST_MODEL_KEY, selectedModelId);
    } catch {
      // Ignore storage failures (private mode / quota).
    }
  }, [selectedModelId]);

  const handleSend = useCallback(() => {
    if (value.trim() && !disabled) {
      onSend(value, selectedModelId);
      setValue("");
      // 重置 textarea 到初始高度
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.style.height = "72px";
          }
        }, 0);
      }
    }
  }, [value, disabled, onSend, selectedModelId]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // 檢查是否正在使用輸入法（如中文輸入法選字）
      // isComposing 為 true 時表示正在組字，不應該發送訊息
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // 自動調整 textarea 高度
  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, []);

  // 計算背景資訊項目數
  const bgInfoItemCount = backgroundInfo
    ? (backgroundInfo.user ? 1 : 0) + (backgroundInfo.problem ? 1 : 0)
    : 0;

  // 判斷是否會在下一則訊息附加背景資訊
  const willAttachBgInfo = !hasMessages && bgInfoItemCount > 0;

  return (
    <div className={styles.chatInputContainer}>
      <div className={styles.chatInputBox}>
        {/* Row 0: 題目上下文提示 (chips) + 背景資訊 badge */}
        {(problemContext || willAttachBgInfo) && (
          <div className={styles.chatInputContext}>
            {problemContext && (
              <Tag
                type="gray"
                size="sm"
                className={styles.contextChip}
              >
                正在編輯：{problemContext.title} (#{problemContext.id})
              </Tag>
            )}
            {willAttachBgInfo && (
              <Tag
                type="blue"
                size="sm"
                renderIcon={Information}
                className={styles.bgInfoBadge}
                title="首次訊息將自動附加背景資訊"
              >
                包含背景資訊 ({bgInfoItemCount})
              </Tag>
            )}
          </div>
        )}

        {/* Row 1: 輸入框 */}
        <textarea
          ref={textareaRef}
          id="chatbot-input"
          className={styles.chatInputTextarea}
          placeholder={placeholder}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={3}
        />

        {/* Row 2: 控制區 - 模型選擇 + 送出按鈕 */}
        <div className={styles.chatInputControls}>
          <Dropdown
            id="model-selector"
            titleText=""
            label={selectedModel.label}
            items={AVAILABLE_MODELS}
            itemToString={(item) => (item ? item.label : "")}
            selectedItem={selectedModel}
            onChange={({ selectedItem }) => {
              if (selectedItem) {
                setSelectedModelId(selectedItem.id);
              }
            }}
            size="sm"
            light
            direction="top"
            className={styles.modelDropdownInline}
          />

          {isStreaming ? (
            <IconButton
              label="停止生成"
              kind="danger--ghost"
              size="sm"
              onClick={onStop}
              className={styles.chatInputButton}
              align="top-left"
            >
              <StopFilled size={16} />
            </IconButton>
          ) : (
            <IconButton
              label="送出"
              kind="secondary"
              size="sm"
              onClick={handleSend}
              disabled={disabled || !value.trim()}
              className={styles.chatInputButton}
              align="top-left"
            >
              <ArrowUp size={16} />
            </IconButton>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
