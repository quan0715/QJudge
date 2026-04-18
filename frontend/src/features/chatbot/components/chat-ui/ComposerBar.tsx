import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { ArrowUp, Checkmark, ChevronDown, InProgress } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ModelInfo } from "@/core/types/chatbot.types";
import styles from "./ComposerBar.module.scss";

const TEXTAREA_MAX_HEIGHT = 160; // sync with $chat-textarea-max-height in _variables.scss

interface ComposerBarProps {
  onSend: (text: string) => void;
  models: ModelInfo[];
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
  onStop?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  placeholder?: string;
  sessionNotice?: string | null;
}

export function ComposerBar({
  onSend,
  models,
  selectedModelId,
  onModelChange,
  onStop,
  isStreaming,
  disabled = false,
  placeholder,
  sessionNotice,
}: ComposerBarProps) {
  const { t } = useTranslation("chatbot");
  const displayPlaceholder = placeholder || t("ui.inputPlaceholder");
  
  const [value, setValue] = useState("");
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const composingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const selectedModel = useMemo(
    () => models.find((model) => model.model_id === selectedModelId) ?? models[0],
    [models, selectedModelId],
  );

  useEffect(() => {
    if (disabled || isStreaming) {
      setIsModelMenuOpen(false);
    }
  }, [disabled, isStreaming]);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!modelMenuRef.current) return;
      if (!modelMenuRef.current.contains(event.target as Node)) {
        setIsModelMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

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
  const hasStatusBlock = Boolean(sessionNotice);

  return (
    <div className={styles.bar}>
      {hasStatusBlock && (
        <div className={styles.statusStack}>
          {sessionNotice && (
            <div className={styles.dividerNotice}>
              <span className={styles.line} />
              <span className={styles.noticeText}>{sessionNotice}</span>
              <span className={styles.line} />
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

        <div className={styles.toolbar}>
          <div className={styles.rightTools}>
            <div className={styles.modelSelectWrap} ref={modelMenuRef}>
              {isStreaming && <span className={styles.streamDot} aria-hidden />}
              <button
                type="button"
                className={styles.modelSelectButton}
                onClick={() => setIsModelMenuOpen((open) => !open)}
                disabled={disabled || isStreaming}
                aria-label={t("ui.modelLabel")}
                aria-haspopup="listbox"
                aria-expanded={isModelMenuOpen}
              >
                <span className={styles.modelText}>{selectedModel?.display_name ?? "gpt-5-nano"}</span>
              </button>
              <ChevronDown size={14} className={styles.modelChevron} aria-hidden />
              {isModelMenuOpen && (
                <div className={styles.modelMenu} role="listbox" aria-label={t("ui.modelLabel")}>
                  {models.map((model) => {
                    const isActive = model.model_id === selectedModelId;
                    return (
                      <button
                        key={model.model_id}
                        type="button"
                        className={`${styles.modelOption} ${isActive ? styles.modelOptionActive : ""}`}
                        role="option"
                        aria-selected={isActive}
                        onClick={() => {
                          onModelChange(model.model_id);
                          setIsModelMenuOpen(false);
                        }}
                      >
                        <span>{model.display_name}</span>
                        {isActive && <Checkmark size={14} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {isStreaming ? (
              <button
                type="button"
                className={`${styles.sendButton} ${styles.runningButton}`}
                onClick={onStop}
                aria-label={t("ui.stopGenerating")}
              >
                <InProgress size={18} className={styles.spinningIcon} />
              </button>
            ) : (
              <button
                type="button"
                className={styles.sendButton}
                onClick={handleSubmit}
                disabled={!canSend}
                aria-label={t("ui.send")}
              >
                <ArrowUp size={18} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
