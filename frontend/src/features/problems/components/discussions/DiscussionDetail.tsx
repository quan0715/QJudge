import React, { useState, useMemo } from "react";
import {
  Button,
  InlineNotification,
  SkeletonText,
  Modal,
} from "@carbon/react";
import { ArrowLeft, TrashCan } from "@carbon/icons-react";
import { useNavigate, Link } from "react-router-dom";
import { MarkdownField } from "@/shared/ui/markdown/markdownEditor/MarkdownField";
import { formatSmartTime } from "@/shared/utils/format";
import { useDiscussionDetail } from "@/features/problems/hooks/useProblemDiscussions";
import {
  ProblemDiscussionThread,
  type DiscussionReply,
  type DiscussionEntityType,
} from "@/shared/ui/discussion";
import type { DiscussionComment } from "@/core/entities/discussion.entity";
import "./Discussions.scss";

interface DiscussionDetailProps {
  discussionId: string;
  problemId?: string;
  /** Callback when discussion is deleted - for navigation */
  onDeleted?: () => void;
}

/**
 * Convert API comments to ProblemDiscussionThread reply format
 */
function commentsToReplies(comments: DiscussionComment[]): DiscussionReply[] {
  // Build a map of parent -> children
  const childrenMap = new Map<string | null, DiscussionComment[]>();

  comments.forEach((comment) => {
    const parentId = comment.parentId || null;
    if (!childrenMap.has(parentId)) {
      childrenMap.set(parentId, []);
    }
    childrenMap.get(parentId)!.push(comment);
  });

  // Recursively build nested structure
  function buildReplies(parentId: string | null): DiscussionReply[] {
    const children = childrenMap.get(parentId) || [];
    return children.map((comment) => ({
      id: comment.id,
      content: comment.isDeleted ? "此評論已被刪除" : comment.content,
      authorUsername: comment.author.username,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      likeCount: comment.likeCount || 0,
      isLiked: comment.isLiked || false,
      replies: buildReplies(comment.id),
    }));
  }

  return buildReplies(null);
}

/**
 * DiscussionDetail - Shows a single discussion with its comments
 *
 * Uses the shared ProblemDiscussionThread component for rendering.
 */
export const DiscussionDetail: React.FC<DiscussionDetailProps> = ({
  discussionId,
  problemId,
  onDeleted: _onDeleted,
}) => {
  const navigate = useNavigate();
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [commentContent, setCommentContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const {
    discussion,
    isDiscussionLoading,
    discussionError,
    comments,
    createComment,
    isCreatingComment,
    deleteComment,
    updateComment,
    isUpdatingComment,
    canReply,
    isAuthenticated,
  } = useDiscussionDetail(discussionId);

  // Convert comments to nested reply structure
  const replies = useMemo(() => commentsToReplies(comments), [comments]);

  const handleSubmitComment = async () => {
    setError(null);

    if (!commentContent.trim()) {
      setError("請輸入評論內容");
      return;
    }

    try {
      await createComment({
        content: commentContent.trim(),
        parent: replyTo,
      });
      setCommentContent("");
      setReplyTo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "發表評論失敗");
    }
  };

  const handleDeleteComment = async (
    commentId: string | number,
    _type: "discussion" | "comment"
  ) => {
    // In DiscussionDetail, we only delete comments (canDelete=false for main discussion)
    if (window.confirm("確定要刪除此評論嗎？")) {
      await deleteComment(commentId.toString());
    }
  };

  const handleReply = (
    parentId: string | number,
    type: "discussion" | "comment"
  ) => {
    if (type === "comment") {
      // Replying to a comment - use the comment ID as parent
      setReplyTo(parentId.toString());
    } else {
      // Replying to the main discussion - no parent
      setReplyTo(null);
    }
    // Focus on the comment input
    document.getElementById("comment-content")?.focus();
  };

  const handleBack = () => {
    if (problemId) {
      navigate(`/problems/${problemId}?tab=discussions`);
    } else {
      navigate(-1);
    }
  };

  // Handle edit - only for comments in detail view
  const handleEdit = (id: string | number, type: DiscussionEntityType) => {
    // In detail view, we only support editing comments (not the main discussion)
    if (type === "comment") {
      const comment = comments.find((c) => c.id === id.toString());
      if (comment) {
        setEditingCommentId(id.toString());
        setEditContent(comment.content);
      }
    }
  };

  const handleCancelEdit = () => {
    setEditingCommentId(null);
    setEditContent("");
  };

  const handleSubmitEdit = async () => {
    if (!editingCommentId) return;

    try {
      await updateComment({
        commentId: editingCommentId,
        payload: { content: editContent },
      });
      handleCancelEdit();
    } catch (err) {
      console.error("Failed to update comment:", err);
    }
  };

  // Loading state
  if (isDiscussionLoading) {
    return (
      <div className="discussion-detail">
        <Button
          kind="ghost"
          size="sm"
          renderIcon={ArrowLeft}
          onClick={handleBack}
        >
          返回討論列表
        </Button>
        <div style={{ marginTop: "1rem" }}>
          <SkeletonText heading width="60%" />
          <SkeletonText width="30%" />
          <SkeletonText paragraph lineCount={4} />
        </div>
      </div>
    );
  }

  // Error state
  if (discussionError) {
    return (
      <div className="discussion-detail">
        <Button
          kind="ghost"
          size="sm"
          renderIcon={ArrowLeft}
          onClick={handleBack}
        >
          返回討論列表
        </Button>
        <InlineNotification
          kind="error"
          title="載入失敗"
          subtitle={discussionError.message}
          style={{ marginTop: "1rem" }}
        />
      </div>
    );
  }

  // Not found
  if (!discussion) {
    return (
      <div className="discussion-detail">
        <Button
          kind="ghost"
          size="sm"
          renderIcon={ArrowLeft}
          onClick={handleBack}
        >
          返回討論列表
        </Button>
        <InlineNotification
          kind="warning"
          title="找不到討論"
          subtitle="此討論可能已被刪除或不存在"
          style={{ marginTop: "1rem" }}
        />
      </div>
    );
  }

  // Deleted discussion
  if (discussion.isDeleted) {
    return (
      <div className="discussion-detail">
        <Button
          kind="ghost"
          size="sm"
          renderIcon={ArrowLeft}
          onClick={handleBack}
        >
          返回討論列表
        </Button>
        <div
          className="discussion-detail__deleted"
          style={{ marginTop: "1rem" }}
        >
          <TrashCan size={32} />
          <p>此討論已被刪除</p>
        </div>
      </div>
    );
  }

  return (
    <div className="discussion-detail">
      <Button
        kind="ghost"
        size="sm"
        renderIcon={ArrowLeft}
        onClick={handleBack}
      >
        返回討論列表
      </Button>

      {/* Discussion Title */}
      <h3 className="discussion-detail__title" style={{ marginTop: "1rem" }}>
        {discussion.title}
      </h3>

      {/* Discussion Thread using shared component */}
      <ProblemDiscussionThread
        id={discussion.id}
        content={discussion.content}
        authorUsername={discussion.author.username}
        createdAt={discussion.createdAt}
        updatedAt={discussion.updatedAt}
        likeCount={discussion.likeCount || 0}
        isLiked={discussion.isLiked || false}
        canReply={canReply}
        canDelete={false} // Don't allow delete from detail view header
        canEdit={isAuthenticated} // Show edit buttons if authenticated, backend will validate
        onReply={handleReply}
        onDelete={handleDeleteComment}
        onEdit={handleEdit}
        formatDate={formatSmartTime}
        replies={replies}
      />

      {/* Comment Form */}
      {!discussion.isDeleted && (
        <div className="comments-section__form" style={{ marginTop: "1.5rem" }}>
          {!isAuthenticated ? (
            <div className="comments-section__login-prompt">
              請先 <Link to="/login">登入</Link> 後再發表評論
            </div>
          ) : (
            <>
              {replyTo && (
                <div
                  style={{
                    marginBottom: "0.5rem",
                    padding: "0.5rem",
                    backgroundColor: "var(--cds-layer-02)",
                    borderRadius: "4px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: "0.875rem" }}>
                    回覆給{" "}
                    {comments.find((c) => c.id === replyTo)?.author.username ||
                      "..."}
                  </span>
                  <Button
                    kind="ghost"
                    size="sm"
                    onClick={() => setReplyTo(null)}
                  >
                    取消
                  </Button>
                </div>
              )}

              {error && (
                <InlineNotification
                  kind="error"
                  title="錯誤"
                  subtitle={error}
                  onClose={() => setError(null)}
                  lowContrast
                  style={{ marginBottom: "0.5rem" }}
                />
              )}

              <MarkdownField
                id="comment-content"
                value={commentContent}
                onChange={setCommentContent}
                placeholder={
                  replyTo
                    ? "輸入回覆內容（支援 Markdown）..."
                    : "發表您的評論（支援 Markdown）..."
                }
                minHeight="100px"
                disabled={isCreatingComment}
              />
              <div className="comments-section__form-actions">
                <Button
                  kind="primary"
                  size="sm"
                  onClick={handleSubmitComment}
                  disabled={isCreatingComment || !commentContent.trim()}
                >
                  {isCreatingComment
                    ? "發表中..."
                    : replyTo
                    ? "回覆"
                    : "發表評論"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Edit Comment Modal */}
      <Modal
        open={!!editingCommentId}
        onRequestClose={handleCancelEdit}
        modalHeading="編輯評論"
        primaryButtonText={isUpdatingComment ? "儲存中..." : "儲存"}
        secondaryButtonText="取消"
        onRequestSubmit={handleSubmitEdit}
        primaryButtonDisabled={isUpdatingComment || !editContent.trim()}
      >
        <MarkdownField
          id="edit-comment-content"
          labelText="內容"
          value={editContent}
          onChange={setEditContent}
          placeholder="請輸入內容（支援 Markdown）..."
          minHeight="150px"
        />
      </Modal>
    </div>
  );
};

export default DiscussionDetail;
