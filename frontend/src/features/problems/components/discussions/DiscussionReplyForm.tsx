import React from "react";
import { Button, InlineNotification } from "@carbon/react";
import { Close } from "@carbon/icons-react";
import { MarkdownField } from "@/shared/ui/markdown/markdownEditor/MarkdownField";

interface DiscussionReplyFormProps {
  fieldId: string;
  isReplyingToComment: boolean;
  replyError: string | null;
  replyContent: string;
  isCreatingComment: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  onClearError: () => void;
}

const DiscussionReplyForm: React.FC<DiscussionReplyFormProps> = ({
  fieldId,
  isReplyingToComment,
  replyError,
  replyContent,
  isCreatingComment,
  onChange,
  onCancel,
  onSubmit,
  onClearError,
}) => {
  return (
    <div className="discussion-list__reply-form">
      {isReplyingToComment && (
        <div className="discussion-list__reply-to">回覆評論</div>
      )}
      {replyError && (
        <InlineNotification
          kind="error"
          title="錯誤"
          subtitle={replyError}
          onClose={onClearError}
          lowContrast
          style={{ marginBottom: "0.5rem" }}
        />
      )}
      <MarkdownField
        id={fieldId}
        value={replyContent}
        onChange={onChange}
        placeholder="輸入您的回覆（支援 Markdown）..."
        minHeight="100px"
        disabled={isCreatingComment}
      />
      <div className="discussion-list__reply-actions">
        <Button
          kind="ghost"
          size="sm"
          renderIcon={Close}
          onClick={onCancel}
          disabled={isCreatingComment}
        >
          取消
        </Button>
        <Button
          kind="primary"
          size="sm"
          onClick={onSubmit}
          disabled={isCreatingComment || !replyContent.trim()}
        >
          {isCreatingComment ? "發送中..." : "回覆"}
        </Button>
      </div>
    </div>
  );
};

export default DiscussionReplyForm;
