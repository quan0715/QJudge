import React, { useState, useEffect } from "react";
import { Edit, Checkmark, Close } from "@carbon/icons-react";
import { IconButton } from "@carbon/react";
import { MarkdownEditor } from "./MarkdownEditor";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import "./MarkdownEditor.scss";

interface InlineMarkdownEditorProps {
  /** Unique field ID */
  id: string;
  /** Label for the field */
  labelText: string;
  /** Current value */
  value: string;
  /** Change handler */
  onChange: (value: string) => void;
  /** Placeholder when empty */
  placeholder?: string;
  /** Minimum height for editor */
  minHeight?: string;
}

/**
 * Inline Markdown Editor - click to edit directly without modal.
 * Shows markdown preview when not editing, inline Monaco editor when editing.
 */
export const InlineMarkdownEditor: React.FC<InlineMarkdownEditorProps> = ({
  // id is kept in props interface for consistency but not used internally
  labelText,
  value,
  onChange,
  placeholder = "點擊以編輯...",
  minHeight = "200px",
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);

  // Sync internal state when external value changes (e.g., form reset)
  useEffect(() => {
    if (!isEditing) {
      setEditValue(value);
    }
  }, [value, isEditing]);

  const handleStartEdit = () => {
    setEditValue(value);
    setIsEditing(true);
  };

  const handleSave = () => {
    onChange(editValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="inline-markdown-editor inline-markdown-editor--editing">
        <div className="inline-markdown-editor__header">
          <span className="inline-markdown-editor__label">{labelText}</span>
          <div className="inline-markdown-editor__actions">
            <IconButton
              kind="ghost"
              size="sm"
              label="取消"
              onClick={handleCancel}
            >
              <Close size={16} />
            </IconButton>
            <IconButton
              kind="primary"
              size="sm"
              label="儲存"
              onClick={handleSave}
            >
              <Checkmark size={16} />
            </IconButton>
          </div>
        </div>
        <div className="inline-markdown-editor__editor" style={{ minHeight }}>
          <MarkdownEditor
            value={editValue}
            onChange={setEditValue}
            minHeight={minHeight}
            inline
            showToolbar
            showPreview
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="inline-markdown-editor"
      onClick={handleStartEdit}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleStartEdit();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`編輯 ${labelText}`}
    >
      <div className="inline-markdown-editor__header">
        <span className="inline-markdown-editor__label">{labelText}</span>
        <div className="inline-markdown-editor__edit-hint">
          <Edit size={14} />
          <span>點擊編輯</span>
        </div>
      </div>
      <div className="inline-markdown-editor__content">
        {value ? (
          <MarkdownRenderer enableMath>{value}</MarkdownRenderer>
        ) : (
          <span className="inline-markdown-editor__placeholder">{placeholder}</span>
        )}
      </div>
    </div>
  );
};
