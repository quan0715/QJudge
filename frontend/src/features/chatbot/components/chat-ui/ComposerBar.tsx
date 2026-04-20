import { useRef, useState, useCallback, useMemo, useEffect, useLayoutEffect } from "react";
import { ArrowUp, Checkmark, ChevronDown, InProgress } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ChatMessage, ModelInfo } from "@/core/types/chatbot.types";
import { SessionBadges, useSessionBadgeSummary } from "./SessionBadges";
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
  /** Session-scoped messages to feed SessionBadges (todo/artifact). */
  messages?: ChatMessage[];
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
  messages,
}: ComposerBarProps) {
  const { t } = useTranslation("chatbot");
  const displayPlaceholder = placeholder || t("ui.inputPlaceholder");

  const [value, setValue] = useState("");
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  // Expanded layout: active when textarea wraps >= 2 visual lines OR the
  // session has badges to show. New chats with a single-line draft and no
  // badges stay in the compact pill layout.
  const [isWrapped, setIsWrapped] = useState(false);
  const badgeSummary = useSessionBadgeSummary(messages ?? []);
  const isExpanded = isWrapped || badgeSummary.hasAny;
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
  }, []);

  // Adjusts textarea height only — never touches isExpanded.
  // Used by both initial render and ResizeObserver so layout shifts
  // (e.g. window/sidebar resize) won't toggle mode and cause flicker.
  const adjustTextareaHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
  }, []);

  // Auto-grow the textarea + detect wrap-to-multiline.
  // One-way: enter wrapped state once content spans > 1.5 lines; exit only
  // when value is fully cleared. Prevents width-change flicker when switching
  // between compact and expanded layouts.
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const next = Math.min(ta.scrollHeight, TEXTAREA_MAX_HEIGHT);
    ta.style.height = `${next}px`;

    if (value.length === 0) {
      if (isWrapped) setIsWrapped(false);
      return;
    }
    if (isWrapped) return;

    const cs = window.getComputedStyle(ta);
    const lineHeight = parseFloat(cs.lineHeight) || 22;
    const paddingY =
      (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    if (next - paddingY > lineHeight * 1.5) {
      setIsWrapped(true);
    }
  }, [value, isWrapped]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      adjustTextareaHeight();
    });
    ro.observe(ta);
    return () => ro.disconnect();
  }, [adjustTextareaHeight]);

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

      <div
        className={`${styles.inputWrapper} ${
          isExpanded ? styles.inputWrapperExpanded : styles.inputWrapperCompact
        }`}
      >
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
          {isExpanded && (
            <div className={styles.leftTools}>
              {badgeSummary.hasAny && messages && (
                <SessionBadges messages={messages} inline />
              )}
            </div>
          )}
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
