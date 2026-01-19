import React, { useState, useEffect } from "react";
import { Modal } from "@carbon/react";
import { useMarkdownEditor } from "./MarkdownEditorContext";
import { MarkdownEditor } from "./MarkdownEditor";
import "./MarkdownEditor.scss";

/**
 * Global modal wrapper for the MarkdownEditor.
 * Should be placed once at a high level in the component tree.
 * Listens to the MarkdownEditorContext for open/close state.
 */
export const GlobalMarkdownEditorModal: React.FC = () => {
  const { activeConfig, isOpen, closeEditor } = useMarkdownEditor();
  const [localValue, setLocalValue] = useState("");

  // Sync local value when config changes
  useEffect(() => {
    if (activeConfig) {
      setLocalValue(activeConfig.value);
    }
  }, [activeConfig]);

  // Handle value change - update both local state and parent
  const handleChange = (newValue: string) => {
    setLocalValue(newValue);
    activeConfig?.onChange(newValue);
  };

  const handleClose = () => {
    closeEditor();
  };

  return (
    <Modal
      open={isOpen}
      onRequestClose={handleClose}
      modalHeading={activeConfig?.labelText ?? "Markdown 編輯器"}
      primaryButtonText="完成"
      secondaryButtonText="取消"
      onRequestSubmit={handleClose}
      onSecondarySubmit={handleClose}
      className="markdown-editor-modal"
      size="lg"
      preventCloseOnClickOutside
    >
      <div className="markdown-editor-modal__body">
        <MarkdownEditor
          value={localValue}
          onChange={handleChange}
          height="100%"
          showToolbar
          showPreview
        />
      </div>
    </Modal>
  );
};
