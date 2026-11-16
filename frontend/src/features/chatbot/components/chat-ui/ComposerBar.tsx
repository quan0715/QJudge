import { useRef, useId, useCallback, useEffect, useLayoutEffect } from "react";
import {
  Add,
  ArrowUp,
  Close,
  Document,
  InProgress,
  Location,
  StopFilled,
  Warning,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { Button, TextArea, Callout, DismissibleTag } from "@carbon/react";
import type {
  CopilotMessage,
  CopilotModel,
  CopilotPendingAttachment,
} from "@copilot";
import { SessionBadges } from "./SessionBadges";
import { ThinkingIndicator } from "./ThinkingIndicator";
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
  modelNotice?: string | null;
  /** Reloads the model list; shown as the notice action when set. */
  onModelNoticeRetry?: () => void;
  /** Session-scoped messages to feed SessionBadges (todo/artifact). */
  messages?: readonly CopilotMessage[];
  /** Where the next message will say the user is; null hides the chip. */
  pageContextLabel?: string | null;
  onDismissPageContext?: () => void;
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
  modelNotice,
  onModelNoticeRetry,
  messages,
  pageContextLabel,
  onDismissPageContext,
}: ComposerBarProps) {
  const { t } = useTranslation("chatbot");
  const displayPlaceholder = placeholder || t("ui.inputPlaceholder");

  const inputId = useId();
  const badgeSummary = useSessionBadgeSummary(messages ?? []);
  const composingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const hasUploadingAttachment = attachments.some(
    (attachment) => attachment.status === "uploading",
  );

  const handleSubmit = useCallback(async () => {
    if (
      (!value.trim() && attachments.length === 0) ||
      !canSend ||
      disabled ||
      isStreaming ||
      hasUploadingAttachment
    ) return;
    await onSend();
  }, [attachments.length, canSend, disabled, hasUploadingAttachment, isStreaming, onSend, value]);

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

  // Recalculate height when the draft or available width changes.
  const adjustTextareaHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
  }, []);

  useLayoutEffect(() => {
    adjustTextareaHeight();
  }, [value, adjustTextareaHeight]);

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
  const hasStatusBlock = Boolean(sessionNotice || modelNotice);
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
      {isStreaming && <ThinkingIndicator messages={messages} />}
      {hasStatusBlock && (
        <div className={styles.statusStack}>
          {modelNotice && (
            <Callout
              kind="warning"
              lowContrast
              title={modelNotice}
              actionButtonLabel={onModelNoticeRetry ? t("ui.retry") : undefined}
              onActionButtonClick={onModelNoticeRetry}
            />
          )}
          {sessionNotice && (
            <div className={styles.dividerNotice}>
              <span className={styles.line} />
              <span className={styles.noticeText}>{sessionNotice}</span>
              <span className={styles.line} />
            </div>
          )}
        </div>
      )}

      {pageContextLabel && onDismissPageContext && (
        <div className={styles.pageContextRow}>
          <DismissibleTag
            size="sm"
            type="cool-gray"
            renderIcon={Location}
            text={pageContextLabel}
            title={t("ui.pageContextDismiss", "不附帶目前頁面")}
            dismissTooltipLabel={t("ui.pageContextDismiss", "不附帶目前頁面")}
            onClose={onDismissPageContext}
            disabled={disabled}
          />
        </div>
      )}

      <div className={styles.inputWrapper}>
        <input
          ref={uploadInputRef}
          type="file"
          accept=".csv,.md,.json,.pdf,text/csv,text/markdown,text/plain,application/json,application/pdf"
          className={styles.uploadInput}
          onChange={handleUploadChange}
          tabIndex={-1}
          aria-hidden
        />
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
        {badgeSummary.hasAny && messages && <SessionBadges messages={messages} inline />}
        <TextArea
          ref={textareaRef}
          value={value}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={() => { composingRef.current = false; }}
          hideLabel
          style={{ resize: "none" }}
          id={`chat-message-${inputId}`}
          className={styles.input}
          labelText={t("ui.inputAriaLabel", "輸入訊息")}
          onChange={handleChange}
          placeholder={displayPlaceholder}
          rows={2}
          disabled={disabled}
        />

        <div className={styles.toolbar} role="group" aria-label={t("ui.composerActions", "訊息操作")}>
          <Button kind="ghost" size="lg" hasIconOnly renderIcon={Add}
            iconDescription={t("ui.addAttachment")} tooltipAlignment="start"
            onClick={handlePickFile} disabled={!canUpload} />
          <ModelSelect
            models={modelOptions}
            selectedModelId={selectedModelId}
            onChange={onModelChange}
            disabled={disabled || isStreaming}
            menuPlacement="top"
            size="lg"
            className={styles.modelControl}
          />
          <span aria-hidden />
          {isStreaming ? (
            <Button kind="primary" size="lg" hasIconOnly renderIcon={StopFilled}
              iconDescription={t("ui.stopGenerating")} tooltipAlignment="end" onClick={onStop} />
          ) : (
            <Button kind="primary" size="lg" hasIconOnly renderIcon={ArrowUp}
              iconDescription={t("ui.send", "送出")} tooltipAlignment="end"
              onClick={handleSubmit} disabled={!canSubmit} />
          )}
        </div>
      </div>
    </div>
  );
}
