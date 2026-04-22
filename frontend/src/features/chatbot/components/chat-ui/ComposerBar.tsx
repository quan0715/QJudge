import { useRef, useState, useCallback, useEffect, useLayoutEffect } from "react";
import { Add, ArrowUp, InProgress } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ChatMessage, ModelInfo } from "@/core/types/chatbot.types";
import { SessionBadges, useSessionBadgeSummary } from "./SessionBadges";
import { ModelSelect } from "./ModelSelect";
import styles from "./ComposerBar.module.scss";

const TEXTAREA_MAX_HEIGHT = 160; // sync with $chat-textarea-max-height in _variables.scss

interface ComposerBarProps {
  onSend: (text: string) => void;
  models: ModelInfo[];
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
  onUpload?: (file: File) => Promise<void>;
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
  onUpload,
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
  // Expanded layout: active when textarea wraps >= 2 visual lines OR the
  // session has badges to show. New chats with a single-line draft and no
  // badges stay in the compact pill layout.
  const [isWrapped, setIsWrapped] = useState(false);
  const badgeSummary = useSessionBadgeSummary(messages ?? []);
  const isExpanded = isWrapped || badgeSummary.hasAny;
  const composingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

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
  const canUpload = Boolean(onUpload) && !disabled && !isStreaming;

  const handlePickFile = useCallback(() => {
    if (!canUpload) return;
    uploadInputRef.current?.click();
  }, [canUpload]);

  const handleUploadChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpload) return;
    await onUpload(file);
    e.target.value = "";
  }, [onUpload]);

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
        <input
          ref={uploadInputRef}
          type="file"
          accept=".csv,.md,text/csv,text/markdown,text/plain"
          className={styles.uploadInput}
          onChange={handleUploadChange}
          tabIndex={-1}
          aria-hidden
        />
        {!isExpanded && (
          <button
            type="button"
            className={styles.attachmentButton}
            onClick={handlePickFile}
            disabled={!canUpload}
            aria-label={t("ui.addAttachment")}
          >
            <Add size={16} />
          </button>
        )}
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
          {isExpanded && badgeSummary.hasAny && messages && (
            <div className={styles.leftTools}>
              <button
                type="button"
                className={styles.attachmentButton}
                onClick={handlePickFile}
                disabled={!canUpload}
                aria-label={t("ui.addAttachment")}
              >
                <Add size={16} />
              </button>
              <SessionBadges messages={messages} inline />
            </div>
          )}
          {isExpanded && (!badgeSummary.hasAny || !messages) && (
            <div className={styles.leftTools}>
              <button
                type="button"
                className={styles.attachmentButton}
                onClick={handlePickFile}
                disabled={!canUpload}
                aria-label={t("ui.addAttachment")}
              >
                <Add size={16} />
              </button>
            </div>
          )}
          <div className={styles.rightTools}>
            <ModelSelect
              models={models}
              selectedModelId={selectedModelId}
              onChange={onModelChange}
              disabled={disabled || isStreaming}
              showStreamDot={isStreaming}
              menuPlacement="top"
              classes={{
                wrap: styles.modelSelectWrap,
                button: styles.modelSelectButton,
                menu: styles.modelMenu,
                text: styles.modelText,
                icon: styles.modelIcon,
                chevron: styles.modelChevron,
                streamDot: styles.streamDot,
              }}
            />
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
