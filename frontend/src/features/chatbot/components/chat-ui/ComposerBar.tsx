import { useRef, useState, useCallback } from "react";
import { IconButton, Tag } from "@carbon/react";
import { Checkmark, InProgress, Send, StopFilled, Warning } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { RunTodoItem } from "@/core/types/chatbot.types";
import styles from "./ComposerBar.module.scss";

const TEXTAREA_MAX_HEIGHT = 160; // sync with $chat-textarea-max-height in _variables.scss

interface ComposerBarProps {
  onSend: (text: string) => void;
  onStop?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  placeholder?: string;
  sessionNotice?: string | null;
  runTodoItems?: RunTodoItem[];
}

export function ComposerBar({
  onSend,
  onStop,
  isStreaming,
  disabled = false,
  placeholder,
  sessionNotice,
  runTodoItems = [],
}: ComposerBarProps) {
  const { t } = useTranslation("chatbot");
  const displayPlaceholder = placeholder || t("ui.inputPlaceholder");
  
  const [value, setValue] = useState("");
  const composingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled || isStreaming) return;
    onSend(trimmed);
    setValue("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, isStreaming, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // During IME composition, ignore Enter
      if (composingRef.current) return;

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    // Auto-resize
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
  }, []);

  const canSend = value.trim().length > 0 && !disabled && !isStreaming;
  const hasStatusBlock = Boolean(sessionNotice) || runTodoItems.length > 0;

  const renderTodoIcon = (item: RunTodoItem) => {
    if (item.status === "success") {
      return <Checkmark size={16} className={`${styles.todoIcon} ${styles.todoIconSuccess}`} />;
    }
    if (item.status === "fail") {
      return <Warning size={16} className={`${styles.todoIcon} ${styles.todoIconFail}`} />;
    }
    return <InProgress size={16} className={`${styles.todoIcon} ${styles.todoIconPending}`} />;
  };

  return (
    <div className={styles.bar}>
      {hasStatusBlock && (
        <div className={styles.statusStack}>
          {sessionNotice && (
            <div className={styles.noticeRow}>
              <Tag type="gray" size="sm">
                {sessionNotice}
              </Tag>
            </div>
          )}

          {runTodoItems.length > 0 && (
            <div className={styles.todoList} aria-label={t("ui.todoList", "待辦清單")}>
              {runTodoItems.map((item) => (
                <div key={item.id} className={styles.todoItem}>
                  {renderTodoIcon(item)}
                  <span className={styles.todoLabel}>{item.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className={styles.inputWrapper}>
        <textarea
          ref={textareaRef}
          className={styles.input}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={() => { composingRef.current = false; }}
          placeholder={displayPlaceholder}
          rows={1}
          disabled={disabled}
          aria-label={t("ui.inputAriaLabel")}
        />
        {isStreaming ? (
          <IconButton
            kind="ghost"
            size="sm"
            label={t("ui.stopGenerating")}
            onClick={onStop}
            className={styles.sendBtn}
          >
            <StopFilled size={20} />
          </IconButton>
        ) : (
          <IconButton
            kind="ghost"
            size="sm"
            label={t("ui.send")}
            onClick={handleSubmit}
            disabled={!canSend}
            className={styles.sendBtn}
          >
            <Send size={20} />
          </IconButton>
        )}
      </div>
    </div>
  );
}
