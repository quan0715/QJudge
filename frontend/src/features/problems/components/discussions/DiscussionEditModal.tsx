import React from "react";
import { Modal, TextInput } from "@carbon/react";
import { MarkdownField } from "@/shared/ui/markdown/markdownEditor/MarkdownField";

interface DiscussionEditModalProps {
  open: boolean;
  showTitle: boolean;
  titleValue: string;
  contentValue: string;
  isSaving: boolean;
  disableSubmit: boolean;
  onChangeTitle: (value: string) => void;
  onChangeContent: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

const DiscussionEditModal: React.FC<DiscussionEditModalProps> = ({
  open,
  showTitle,
  titleValue,
  contentValue,
  isSaving,
  disableSubmit,
  onChangeTitle,
  onChangeContent,
  onClose,
  onSubmit,
}) => {
  return (
    <Modal
      open={open}
      onRequestClose={onClose}
      modalHeading={showTitle ? "編輯討論" : "編輯評論"}
      primaryButtonText={isSaving ? "儲存中..." : "儲存"}
      secondaryButtonText="取消"
      onRequestSubmit={onSubmit}
      primaryButtonDisabled={disableSubmit}
    >
      {showTitle && (
        <TextInput
          id="edit-title"
          labelText="標題"
          value={titleValue}
          onChange={(e) => onChangeTitle(e.target.value)}
          placeholder="討論標題"
          style={{ marginBottom: "1rem" }}
        />
      )}
      <MarkdownField
        id="edit-content"
        labelText="內容"
        value={contentValue}
        onChange={onChangeContent}
        placeholder="請輸入內容（支援 Markdown）..."
        minHeight="150px"
      />
    </Modal>
  );
};

export default DiscussionEditModal;
