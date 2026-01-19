import React from "react";
import { MarkdownEditor } from "./MarkdownEditor";
import "./MarkdownEditor.scss";

interface MarkdownFieldProps {
  /** Unique field ID */
  id?: string;
  /** Label for the field (optional; not rendered visually) */
  labelText?: string;
  /** Current value */
  value: string;
  /** Change handler - called on every change */
  onChange: (value: string) => void;
  /** Placeholder when empty */
  placeholder?: string;
  /** Minimum height for editor */
  minHeight?: string;
  /** Whether to show the preview pane */
  showPreview?: boolean;
  /** Helper text displayed below the field */
  helperText?: string;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Whether the field is in invalid state */
  invalid?: boolean;
  /** Text shown when invalid */
  invalidText?: string;
}

/**
 * MarkdownField - Always-visible markdown editor for forms.
 * Styled to match Carbon Design System form fields.
 */
export const MarkdownField: React.FC<MarkdownFieldProps> = ({
  id: _id,
  labelText: _labelText,
  value,
  onChange,
  placeholder: _placeholder,
  minHeight = "200px",
  showPreview = false,
  helperText,
  disabled = false,
  invalid = false,
  invalidText,
}) => {
  const classNames = [
    "markdown-field",
    invalid && "markdown-field--invalid",
    disabled && "markdown-field--disabled",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classNames}>
      <div className="markdown-field__editor">
        <MarkdownEditor
          value={value}
          onChange={onChange}
          minHeight={minHeight}
          inline
          showToolbar={!disabled}
          showPreview={showPreview}
        />
      </div>
      {(helperText || (invalid && invalidText)) && (
        <div className="markdown-field__helper-text">
          {invalid && invalidText ? invalidText : helperText}
        </div>
      )}
    </div>
  );
};
