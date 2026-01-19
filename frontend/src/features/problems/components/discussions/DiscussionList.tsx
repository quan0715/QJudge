import React, { useState } from "react";
import {
  Button,
  Tile,
  Tag,
  InlineNotification,
  SkeletonText,
  Modal,
  TextInput,
} from "@carbon/react";
import { Add, Chat, Close } from "@carbon/icons-react";
import { useNavigate } from "react-router-dom";
import { MarkdownField } from "@/shared/ui/markdown/markdownEditor/MarkdownField";
import { formatSmartTime } from "@/shared/utils/format";
import { useDiscussionList } from "@/features/problems/hooks/useProblemDiscussions";
import {
  ProblemDiscussionThread,
  type DiscussionReply,
  type DiscussionEntityType,
} from "@/shared/ui/discussion";
import type {
  Discussion,
  DiscussionComment,
} from "@/core/entities/discussion.entity";
import { CreateDiscussionModal } from "./CreateDiscussionModal";
import "./Discussions.scss";

/**
 * Convert flat comments array to nested DiscussionReply tree structure
 */
function commentsToReplies(comments: DiscussionComment[]): DiscussionReply[] {
  // Build a map of id -> reply object
  const replyMap = new Map<string, DiscussionReply>();
  const rootReplies: DiscussionReply[] = [];

  // First pass: create all reply objects
  for (const comment of comments) {
    if (comment.isDeleted) continue; // Skip deleted comments

    const reply: DiscussionReply = {
      id: comment.id,
      content: comment.content,
      authorUsername: comment.author.username,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      likeCount: comment.likeCount,
      isLiked: comment.isLiked,
      replies: [],
    };
    replyMap.set(comment.id, reply);
  }

  // Second pass: build tree structure
  for (const comment of comments) {
    if (comment.isDeleted) continue;

    const reply = replyMap.get(comment.id);
    if (!reply) continue;

    if (comment.parentId && replyMap.has(comment.parentId)) {
      // Has parent - add to parent's replies
      const parent = replyMap.get(comment.parentId);
      parent?.replies?.push(reply);
    } else {
      // No parent or parent not found - root level reply
      rootReplies.push(reply);
    }
  }

  return rootReplies;
}

/**
 * Reply target interface - tracks which discussion/comment is being replied to
 */
interface ReplyTarget {
  discussionId: string;
  parentCommentId?: string; // If replying to a comment, store the comment ID
}

/**
 * Edit target interface - tracks which discussion/comment is being edited
 */
interface EditTarget {
  id: string;
  type: DiscussionEntityType;
  title?: string; // Only for discussions
  content: string;
}

interface DiscussionListProps {
  problemId: string;
  /** Whether to show as inline section or standalone page */
  compact?: boolean;
  /** Max items to show in compact mode */
  maxItems?: number;
  /** Click handler for discussion item */
  onSelectDiscussion?: (discussion: Discussion) => void;
}

/**
 * DiscussionList - Shows a list of discussions for a problem
 *
 * Uses the shared ProblemDiscussionThread component for rendering each thread.
 * Supports inline reply functionality with nested replies.
 */
export const DiscussionList: React.FC<DiscussionListProps> = ({
  problemId,
  compact = false,
  maxItems = 5,
  onSelectDiscussion: _onSelectDiscussion,
}) => {
  const navigate = useNavigate();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Inline reply state - now tracks both discussion and parent comment
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);

  // Edit state
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const {
    discussions,
    totalCount,
    isLoading,
    error,
    createDiscussion,
    isCreating,
    deleteDiscussion,
    deleteComment,
    createCommentOnDiscussion,
    isCreatingComment,
    toggleDiscussionLike,
    toggleCommentLike,
    updateDiscussion,
    isUpdatingDiscussion,
    updateComment,
    isUpdatingComment,
    canDelete,
    canEdit,
    isAuthenticated,
  } = useDiscussionList(problemId, {
    pageSize: compact ? maxItems : 20,
  });

  const handleCreateDiscussion = async (title: string, content: string) => {
    await createDiscussion({ title, content });
    setIsCreateModalOpen(false);
  };

  const handleDeleteDiscussion = async (discussionId: string | number) => {
    if (window.confirm("確定要刪除此討論嗎？")) {
      await deleteDiscussion(discussionId.toString());
    }
  };

  const handleDeleteComment = async (commentId: string | number) => {
    if (window.confirm("確定要刪除此評論嗎？")) {
      await deleteComment(commentId.toString());
    }
  };

  // Handle reply - can be to discussion or to a comment
  const handleReply = (discussionId: string, parentId?: string | number) => {
    if (!isAuthenticated) {
      navigate("/login", { state: { from: window.location.pathname } });
      return;
    }

    // If parentId is provided and different from discussionId, it's a comment reply
    const parentCommentId =
      parentId && parentId.toString() !== discussionId
        ? parentId.toString()
        : undefined;

    setReplyTarget({ discussionId, parentCommentId });
    setReplyContent("");
    setReplyError(null);
  };

  const handleCancelReply = () => {
    setReplyTarget(null);
    setReplyContent("");
    setReplyError(null);
  };

  const handleSubmitReply = async () => {
    if (!replyTarget) return;

    if (!replyContent.trim()) {
      setReplyError("請輸入回覆內容");
      return;
    }

    try {
      await createCommentOnDiscussion({
        discussionId: replyTarget.discussionId,
        payload: {
          content: replyContent.trim(),
          parent: replyTarget.parentCommentId || undefined,
        },
      });
      setReplyTarget(null);
      setReplyContent("");
      setReplyError(null);
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : "回覆失敗");
    }
  };

  const handleCreateClick = () => {
    if (!isAuthenticated) {
      navigate("/login", { state: { from: window.location.pathname } });
      return;
    }
    setIsCreateModalOpen(true);
  };

  // Handle like for discussion main post
  const handleDiscussionLike = async (discussionId: string | number) => {
    if (!isAuthenticated) {
      navigate("/login", { state: { from: window.location.pathname } });
      return;
    }
    try {
      await toggleDiscussionLike(discussionId.toString());
    } catch (err) {
      console.error("Failed to toggle discussion like:", err);
    }
  };

  // Handle like for comments/replies
  const handleCommentLike = async (commentId: string | number) => {
    if (!isAuthenticated) {
      navigate("/login", { state: { from: window.location.pathname } });
      return;
    }
    try {
      await toggleCommentLike(commentId.toString());
    } catch (err) {
      console.error("Failed to toggle comment like:", err);
    }
  };

  // Handle edit - find item and open edit modal
  const handleEdit = (id: string | number, type: DiscussionEntityType) => {
    const idStr = id.toString();

    if (type === "discussion") {
      const discussion = discussions.find((d) => d.id === idStr);
      if (discussion) {
        setEditTarget({
          id: idStr,
          type: "discussion",
          title: discussion.title,
          content: discussion.content,
        });
        setEditTitle(discussion.title);
        setEditContent(discussion.content);
      }
    } else {
      // Find comment in any discussion's comments
      for (const discussion of discussions) {
        const comment = discussion.comments?.find((c) => c.id === idStr);
        if (comment) {
          setEditTarget({
            id: idStr,
            type: "comment",
            content: comment.content,
          });
          setEditContent(comment.content);
          break;
        }
      }
    }
  };

  const handleCancelEdit = () => {
    setEditTarget(null);
    setEditTitle("");
    setEditContent("");
  };

  const handleSubmitEdit = async () => {
    if (!editTarget) return;

    try {
      if (editTarget.type === "discussion") {
        await updateDiscussion({
          discussionId: editTarget.id,
          payload: {
            title: editTitle,
            content: editContent,
          },
        });
      } else {
        await updateComment({
          commentId: editTarget.id,
          payload: {
            content: editContent,
          },
        });
      }
      handleCancelEdit();
    } catch (err) {
      console.error("Failed to update:", err);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="discussion-list">
        <div className="discussion-list__header">
          <h4>討論區</h4>
        </div>
        <div className="discussion-list__content">
          {[1, 2, 3].map((i) => (
            <Tile
              key={i}
              className="discussion-list__item discussion-list__item--skeleton"
            >
              <SkeletonText heading width="60%" />
              <SkeletonText width="80%" />
              <SkeletonText width="40%" />
            </Tile>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="discussion-list">
        <InlineNotification
          kind="error"
          title="載入失敗"
          subtitle={error.message}
          hideCloseButton
        />
      </div>
    );
  }

  return (
    <div className="discussion-list">
      <div className="discussion-list__header">
        <div className="discussion-list__title">
          <h4>討論區</h4>
          <Tag type="gray" size="sm">
            {totalCount} 則討論
          </Tag>
        </div>
        <Button
          kind="ghost"
          size="sm"
          renderIcon={Add}
          onClick={handleCreateClick}
        >
          發起討論
        </Button>
      </div>

      <div className="discussion-list__content">
        {discussions.length === 0 ? (
          <Tile className="discussion-list__empty">
            <Chat size={32} />
            <p>目前沒有討論</p>
            <Button kind="tertiary" size="sm" onClick={handleCreateClick}>
              成為第一個發起討論的人
            </Button>
          </Tile>
        ) : (
          discussions.map((discussion) => {
            // Handle deleted discussions
            if (discussion.isDeleted) {
              return (
                <Tile
                  key={discussion.id}
                  className="discussion-list__item--deleted"
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <Tag type="gray" size="sm">
                      已刪除
                    </Tag>
                    <span
                      style={{
                        color: "var(--cds-text-secondary)",
                        fontSize: "0.875rem",
                      }}
                    >
                      此討論已被刪除
                    </span>
                  </div>
                </Tile>
              );
            }

            const isReplying = replyTarget?.discussionId === discussion.id;
            const replies = commentsToReplies(discussion.comments || []);

            return (
              <div
                key={discussion.id}
                className="discussion-list__item-wrapper"
              >
                <ProblemDiscussionThread
                  id={discussion.id}
                  content={`**${discussion.title}**\n\n${discussion.content}`}
                  authorUsername={discussion.author.username}
                  createdAt={discussion.createdAt}
                  updatedAt={discussion.updatedAt}
                  likeCount={discussion.likeCount || 0}
                  isLiked={discussion.isLiked || false}
                  canReply={isAuthenticated}
                  canDelete={canDelete(discussion)}
                  canEdit={canEdit(discussion)}
                  onReply={(parentId, type) => {
                    // type tells us if we're replying to a discussion or comment
                    if (type === "comment") {
                      // Replying to a comment - parentId is the comment ID
                      handleReply(discussion.id, parentId);
                    } else {
                      // Replying to the discussion main post
                      handleReply(discussion.id);
                    }
                  }}
                  onDelete={(id, type) => {
                    // type tells us if we're deleting a discussion or comment
                    if (type === "comment") {
                      handleDeleteComment(id);
                    } else {
                      handleDeleteDiscussion(id);
                    }
                  }}
                  onEdit={handleEdit}
                  onLike={(id, type) => {
                    // type tells us if we're liking a discussion or comment
                    if (type === "comment") {
                      handleCommentLike(id);
                    } else {
                      handleDiscussionLike(id);
                    }
                  }}
                  formatDate={formatSmartTime}
                  replies={replies}
                />

                {/* Inline Reply Form */}
                {isReplying && (
                  <div className="discussion-list__reply-form">
                    {replyTarget.parentCommentId && (
                      <div className="discussion-list__reply-to">回覆評論</div>
                    )}
                    {replyError && (
                      <InlineNotification
                        kind="error"
                        title="錯誤"
                        subtitle={replyError}
                        onClose={() => setReplyError(null)}
                        lowContrast
                        style={{ marginBottom: "0.5rem" }}
                      />
                    )}
                    <MarkdownField
                      id={`reply-${discussion.id}-${
                        replyTarget.parentCommentId || "main"
                      }`}
                      value={replyContent}
                      onChange={setReplyContent}
                      placeholder="輸入您的回覆（支援 Markdown）..."
                      minHeight="100px"
                      disabled={isCreatingComment}
                    />
                    <div className="discussion-list__reply-actions">
                      <Button
                        kind="ghost"
                        size="sm"
                        renderIcon={Close}
                        onClick={handleCancelReply}
                        disabled={isCreatingComment}
                      >
                        取消
                      </Button>
                      <Button
                        kind="primary"
                        size="sm"
                        onClick={handleSubmitReply}
                        disabled={isCreatingComment || !replyContent.trim()}
                      >
                        {isCreatingComment ? "發送中..." : "回覆"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {compact && totalCount > maxItems && (
        <div className="discussion-list__more">
          <Button
            kind="ghost"
            size="sm"
            onClick={() => navigate(`/problems/${problemId}?tab=discussions`)}
          >
            查看全部 {totalCount} 則討論
          </Button>
        </div>
      )}

      <CreateDiscussionModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateDiscussion}
        isLoading={isCreating}
      />

      {/* Edit Modal */}
      <Modal
        open={!!editTarget}
        onRequestClose={handleCancelEdit}
        modalHeading={
          editTarget?.type === "discussion" ? "編輯討論" : "編輯評論"
        }
        primaryButtonText={
          isUpdatingDiscussion || isUpdatingComment ? "儲存中..." : "儲存"
        }
        secondaryButtonText="取消"
        onRequestSubmit={handleSubmitEdit}
        primaryButtonDisabled={
          isUpdatingDiscussion ||
          isUpdatingComment ||
          !editContent.trim() ||
          (editTarget?.type === "discussion" && !editTitle.trim())
        }
      >
        {editTarget?.type === "discussion" && (
          <TextInput
            id="edit-title"
            labelText="標題"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="討論標題"
            style={{ marginBottom: "1rem" }}
          />
        )}
        <MarkdownField
          id="edit-content"
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

export default DiscussionList;
