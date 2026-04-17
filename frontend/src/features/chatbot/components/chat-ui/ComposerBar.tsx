import { useRef, useState, useCallback } from "react";
import { IconButton } from "@carbon/react";
import { Send, StopFilled } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import styles from "./ComposerBar.module.scss";

const TEXTAREA_MAX_HEIGHT = 160; // sync with $chat-textarea-max-height in _variables.scss

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
  placeholder,
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
