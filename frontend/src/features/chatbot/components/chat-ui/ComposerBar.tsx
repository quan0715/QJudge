import { useRef, useState, useCallback } from "react";
import { IconButton } from "@carbon/react";
import { Send, StopFilled } from "@carbon/icons-react";
import styles from "./ComposerBar.module.scss";

interface ComposerBarProps {
  onSend: (text: string) => void;
  onStop?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function ComposerBar({
  onSend,
  onStop,
  isStreaming,
  disabled = false,
  placeholder = "輸入訊息…",
}: ComposerBarProps) {
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
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, []);

  const canSend = value.trim().length > 0 && !disabled && !isStreaming;

  return (
    <div className={styles.bar}>
      {/* Future: attach button slot goes here */}
      <div className={styles.inputWrapper}>
        <textarea
          ref={textareaRef}
          className={styles.input}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={() => { composingRef.current = false; }}
          placeholder={placeholder}
          rows={1}
          disabled={disabled}
          aria-label="訊息輸入"
        />
        {isStreaming ? (
          <IconButton
            kind="ghost"
            size="sm"
            label="停止生成"
            onClick={onStop}
            className={styles.sendBtn}
          >
            <StopFilled size={20} />
          </IconButton>
        ) : (
          <IconButton
            kind="ghost"
            size="sm"
            label="送出"
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
