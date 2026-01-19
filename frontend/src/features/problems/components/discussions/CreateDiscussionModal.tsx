import React, { useState } from "react";
import { Modal, TextInput, InlineNotification } from "@carbon/react";
import { MarkdownField } from "@/shared/ui/markdown/markdownEditor/MarkdownField";

interface CreateDiscussionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (title: string, content: string) => Promise<void>;
  isLoading: boolean;
}

/**
 * Modal for creating a new discussion
 */
export const CreateDiscussionModal: React.FC<CreateDiscussionModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
}) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);

    // Validation
    if (!title.trim()) {
      setError('請輸入標題');
      return;
    }
    if (!content.trim()) {
      setError('請輸入內容');
      return;
    }

    try {
      await onSubmit(title.trim(), content.trim());
      // Reset form on success
      setTitle('');
      setContent('');
    } catch (err: any) {
      setError(err.message || '建立討論失敗');
    }
  };

  const handleClose = () => {
    setTitle('');
    setContent('');
    setError(null);
    onClose();
  };

  return (
    <Modal
      open={isOpen}
      modalHeading="發起新討論"
      primaryButtonText={isLoading ? '發布中...' : '發布'}
      secondaryButtonText="取消"
      onRequestClose={handleClose}
      onRequestSubmit={handleSubmit}
      primaryButtonDisabled={isLoading}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {error && (
          <InlineNotification
            kind="error"
            title="錯誤"
            subtitle={error}
            hideCloseButton
            lowContrast
          />
        )}

        <TextInput
          id="discussion-title"
          labelText="標題"
          placeholder="請輸入討論標題"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          disabled={isLoading}
        />

        <MarkdownField
          id="discussion-content"
          labelText="內容"
          value={content}
          onChange={setContent}
          placeholder="請描述您的問題或想法（支援 Markdown）..."
          minHeight="150px"
          disabled={isLoading}
        />

        <p style={{ color: "var(--cds-text-secondary)", fontSize: "0.75rem" }}>
          支援 Markdown 語法。請確保討論內容與題目相關，並遵守社群規範。
        </p>
      </div>
    </Modal>
  );
};

export default CreateDiscussionModal;
