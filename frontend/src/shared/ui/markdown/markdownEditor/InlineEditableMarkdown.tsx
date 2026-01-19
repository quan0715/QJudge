import React, { useState, useRef, useEffect } from "react";
import { Edit } from "@carbon/icons-react";
import { MarkdownEditor } from "./MarkdownEditor";
import MarkdownRenderer from "../MarkdownRenderer";
import "./InlineEditableMarkdown.scss";

interface InlineEditableMarkdownProps {
  /** Unique field ID */
  id?: string;
  /** Label for the field */
  labelText: string;
  /** Current value */
  value: string;
  /** Change handler */
  onChange: (value: string) => void;
  /** Blur handler - called when exiting edit mode */
  onBlur?: () => void;
  /** Placeholder when empty */
  placeholder?: string;
  /** Minimum height for editor */
  minHeight?: string;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Whether the field is in invalid state */
  invalid?: boolean;
  /** Text shown when invalid */
  invalidText?: string;
}

/**
 * InlineEditableMarkdown - View mode by default, click to edit inline
 *
 * Similar to Notion's inline editing:
 * - Shows rendered markdown preview by default
 * - On hover, shows border and edit icon
 * - On click, expands to inline markdown editor
 * - Click outside or press Escape to close
 */
export const InlineEditableMarkdown: React.FC<InlineEditableMarkdownProps> = ({
  id,
  labelText,
  value,
  onChange,
  onBlur,
  placeholder = "點擊以編輯...",
  minHeight = "100px",
  disabled = false,
  invalid = false,
  invalidText,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  // Exit edit mode and trigger onBlur
  const exitEditMode = () => {
    setIsEditing(false);
    onBlur?.();
  };

  // Handle click outside to close editor
  useEffect(() => {
    if (!isEditing) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        exitEditMode();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        exitEditMode();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isEditing]);

  const handleViewClick = () => {
    if (!disabled) {
      setIsEditing(true);
    }
  };

  const isEmpty = !value || value.trim() === "";

  const classNames = [
    "inline-editable-markdown",
    isEditing && "inline-editable-markdown--editing",
    disabled && "inline-editable-markdown--disabled",
    invalid && "inline-editable-markdown--invalid",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classNames} ref={containerRef}>
      {/* Label */}
      <label className="inline-editable-markdown__label" htmlFor={id}>
        {labelText}
      </label>

      {/* View Mode */}
      {!isEditing && (
        <div
          className="inline-editable-markdown__view"
          onClick={handleViewClick}
          role="button"
          tabIndex={disabled ? -1 : 0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleViewClick();
            }
          }}
          style={{ minHeight }}
        >
          {isEmpty ? (
            <span className="inline-editable-markdown__placeholder">
              {placeholder}
            </span>
          ) : (
            <div className="inline-editable-markdown__preview">
              <MarkdownRenderer enableMath enableCopy={false}>
                {value}
              </MarkdownRenderer>
            </div>
          )}
          {!disabled && (
            <span className="inline-editable-markdown__edit-hint">
              <Edit size={16} />
              <span>編輯</span>
            </span>
          )}
        </div>
      )}

      {/* Edit Mode */}
      {isEditing && (
        <div className="inline-editable-markdown__editor" ref={editorRef}>
          <MarkdownEditor
            value={value}
            onChange={onChange}
            minHeight={minHeight}
            inline
            showToolbar
            showPreview={false}
          />
        </div>
      )}

      {/* Error message */}
      {invalid && invalidText && (
        <div className="inline-editable-markdown__error">{invalidText}</div>
      )}
    </div>
  );
};

export default InlineEditableMarkdown;
