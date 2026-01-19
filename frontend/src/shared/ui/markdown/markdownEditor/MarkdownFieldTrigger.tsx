import React from "react";
import { Edit } from "@carbon/icons-react";
import { useMarkdownEditor } from "./MarkdownEditorContext";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import "./MarkdownEditor.scss";

interface MarkdownFieldTriggerProps {
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
}

/**
 * A clickable trigger that displays markdown preview and opens the editor modal.
 * Replaces TextArea in forms that need rich markdown editing.
 */
export const MarkdownFieldTrigger: React.FC<MarkdownFieldTriggerProps> = ({
  id,
  labelText,
  value,
  onChange,
  placeholder = "點擊以編輯...",
}) => {
  const { openEditor } = useMarkdownEditor();

  const handleClick = () => {
    openEditor({
      fieldId: id,
      labelText,
      value,
      onChange,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      className="markdown-field-trigger"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`編輯 ${labelText}`}
    >
      <span className="markdown-field-trigger__label">{labelText}</span>
      <div className="markdown-field-trigger__content">
        {value ? (
          <MarkdownRenderer enableMath>{value}</MarkdownRenderer>
        ) : (
          <span className="markdown-field-trigger__placeholder">{placeholder}</span>
        )}
      </div>
      <div className="markdown-field-trigger__edit-hint">
        <Edit size={14} />
        <span>點擊開啟編輯器</span>
      </div>
    </div>
  );
};
