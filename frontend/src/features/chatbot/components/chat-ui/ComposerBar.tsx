import { useRef, useState, useCallback, useEffect, useLayoutEffect } from "react";
import {
  Add,
  ArrowUp,
  Close,
  Document,
  InProgress,
  Warning,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type {
  CopilotMessage,
  CopilotModel,
  CopilotPendingAttachment,
} from "@copilot";
import { SessionBadges } from "./SessionBadges";
import { useSessionBadgeSummary } from "./useSessionBadgeSummary";
import { ModelSelect } from "@/shared/ai/ModelSelect";
import styles from "./ComposerBar.module.scss";

const TEXTAREA_MAX_HEIGHT = 160; // sync with $chat-textarea-max-height in _variables.scss

interface ComposerBarProps {
  value: string;
  onValueChange(value: string): void;
  attachments: readonly CopilotPendingAttachment[];
  onAddAttachments(files: readonly File[]): void | Promise<void>;
  onRemoveAttachment(id: string): void;
  onSend(): Promise<boolean>;
  canSend: boolean;
  models: readonly CopilotModel[];
  selectedModelId: string | null;
  onModelChange: (modelId: string) => void;
  onStop?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  placeholder?: string;
  sessionNotice?: string | null;
  /** Session-scoped messages to feed SessionBadges (todo/artifact). */
  messages?: readonly CopilotMessage[];
}

export function ComposerBar({
  value,
  onValueChange,
  attachments,
  onAddAttachments,
  onRemoveAttachment,
  onSend,
  canSend,
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

  // Expanded layout: active when textarea wraps >= 2 visual lines OR the
  // session has badges to show. New chats with a single-line draft and no
  // badges stay in the compact pill layout.
  const [isWrapped, setIsWrapped] = useState(false);
  const badgeSummary = useSessionBadgeSummary(messages ?? []);
  const isExpanded =
    (value.length > 0 && isWrapped) ||
    badgeSummary.hasAny ||
    attachments.length > 0;
  const composingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const hasUploadingAttachment = attachments.some(
    (attachment) => attachment.status === "uploading",
  );

  const handleSubmit = useCallback(async () => {
    if (
      (!value.trim() && attachments.length === 0) ||
      disabled ||
      isStreaming ||
      hasUploadingAttachment
    ) return;
    await onSend();
  }, [attachments.length, disabled, hasUploadingAttachment, isStreaming, onSend, value]);

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
    onValueChange(e.target.value);
  }, [onValueChange]);

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

    if (value.length === 0) return;
    if (isWrapped) return;

    const cs = window.getComputedStyle(ta);
    const lineHeight = parseFloat(cs.lineHeight) || 22;
    const paddingY =
      (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    if (next - paddingY > lineHeight * 1.5) {
      const frame = window.requestAnimationFrame(() => setIsWrapped(true));
      return () => window.cancelAnimationFrame(frame);
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

  const canSubmit =
    canSend &&
    (value.trim().length > 0 || attachments.length > 0) &&
    !disabled &&
    !isStreaming &&
    !hasUploadingAttachment;
  const hasStatusBlock = Boolean(sessionNotice);
  const canUpload = !disabled && !isStreaming && !hasUploadingAttachment;

  const handlePickFile = useCallback(() => {
    if (!canUpload) return;
    uploadInputRef.current?.click();
  }, [canUpload]);

  const handleUploadChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void onAddAttachments([file]);
    e.target.value = "";
  }, [onAddAttachments]);

  const modelOptions = models.map((model) => ({
    id: model.id,
    label: model.displayName,
  }));

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
          accept=".csv,.md,.json,.pdf,text/csv,text/markdown,text/plain,application/json,application/pdf"
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
        {attachments.length > 0 && (
          <div className={styles.pendingFileList} aria-label={t("ui.pendingFiles", "待上傳檔案")}>
            {attachments.map((attachment) => (
              <span className={styles.pendingFileTag} key={attachment.id}>
                <Document size={14} className={styles.pendingFileIcon} />
                <span className={styles.pendingFileName}>{attachment.file.name}</span>
                {attachment.status === "uploading" && (
                  <span className={styles.pendingFileStatus} role="status">
                    <InProgress size={14} className={styles.spinningIcon} aria-hidden />
                    <span>{t("ui.attachmentUploading", "上傳中")}</span>
                  </span>
                )}
                {attachment.status === "error" && (
                  <span className={styles.pendingFileError} role="alert">
                    <Warning size={14} aria-hidden />
                    <span>
                      {attachment.error?.message ??
                        t("ui.attachmentUploadError", "附件上傳失敗")}
                    </span>
                  </span>
                )}
                <button
                  type="button"
                  className={styles.pendingFileRemove}
                  onClick={() => onRemoveAttachment(attachment.id)}
                  disabled={disabled || isStreaming || hasUploadingAttachment}
                  aria-label={t("ui.removeAttachment", "移除附件")}
                  title={t("ui.removeAttachment", "移除附件")}
                >
                  <Close size={14} />
                </button>
              </span>
            ))}
          </div>
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
          aria-label={t("ui.inputAriaLabel", "輸入訊息")}
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
              models={modelOptions}
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
                disabled={!canSubmit}
                aria-label={t("ui.send", "送出")}
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
