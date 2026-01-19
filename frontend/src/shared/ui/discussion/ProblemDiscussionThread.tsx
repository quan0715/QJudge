import type { FC } from "react";
import { Button, Tag } from "@carbon/react";
import {
  TrashCan,
  FavoriteFilled,
  Favorite,
  Chat,
  Edit,
} from "@carbon/icons-react";
import { Avatar } from "@/shared/ui/avatar";
import { MarkdownRenderer } from "@/shared/ui/markdown";
import styles from "./ProblemDiscussionThread.module.scss";

/**
 * Check if content has been edited (updatedAt is significantly later than createdAt)
 */
function isEdited(createdAt: string, updatedAt?: string): boolean {
  if (!updatedAt) return false;
  const created = new Date(createdAt).getTime();
  const updated = new Date(updatedAt).getTime();
  // Consider edited if updated more than 1 second after created
  return updated > created + 1000;
}

/** 實體類型：討論主文 或 評論 */
export type DiscussionEntityType = "discussion" | "comment";

/** 回覆資料結構（可嵌套） */
export interface DiscussionReply {
  /** 回覆 ID */
  id: string | number;
  /** 回覆內容 */
  content: string;
  /** 回覆者名稱 */
  authorUsername?: string;
  /** 頭像 URL */
  avatarUrl?: string;
  /** 建立時間 */
  createdAt: string;
  /** 更新時間 */
  updatedAt?: string;
  /** 按讚數 */
  likeCount?: number;
  /** 是否已按讚 */
  isLiked?: boolean;
  /** 嵌套回覆 */
  replies?: DiscussionReply[];
}

export interface ProblemDiscussionThreadProps {
  /** 討論串 ID */
  id: string | number;
  /** 討論內容 */
  content: string;
  /** 相關題目標題 */
  problemTitle?: string;
  /** 回覆列表（可嵌套） */
  replies?: DiscussionReply[];
  /** 提問者名稱 */
  authorUsername?: string;
  /** 頭像 URL */
  avatarUrl?: string;
  /** 建立時間 */
  createdAt: string;
  /** 更新時間 */
  updatedAt?: string;
  /** 按讚數 */
  likeCount?: number;
  /** 是否已按讚 */
  isLiked?: boolean;
  /** 回覆事件 - type 指出是回覆討論主文或評論 */
  onReply?: (parentId: string | number, type: DiscussionEntityType) => void;
  /** 刪除事件 - type 指出是刪除討論主文或評論 */
  onDelete?: (id: string | number, type: DiscussionEntityType) => void;
  /** 編輯事件 - type 指出是編輯討論主文或評論 */
  onEdit?: (id: string | number, type: DiscussionEntityType) => void;
  /** 按讚事件 - type 指出是按讚討論主文或評論 */
  onLike?: (id: string | number, type: DiscussionEntityType) => void;
  /** 是否可回覆 */
  canReply?: boolean;
  /** 是否可刪除 */
  canDelete?: boolean;
  /** 是否可編輯 */
  canEdit?: boolean;
  /** 日期格式化函式 */
  formatDate?: (dateStr: string) => string;
}

/** 回覆項目元件 */
const ReplyItem: FC<{
  reply: DiscussionReply;
  depth?: number;
  isLast?: boolean;
  formatDate?: (dateStr: string) => string;
  canReply?: boolean;
  canDelete?: boolean;
  canEdit?: boolean;
  onReply?: (parentId: string | number, type: DiscussionEntityType) => void;
  onDelete?: (id: string | number, type: DiscussionEntityType) => void;
  onEdit?: (id: string | number, type: DiscussionEntityType) => void;
  onLike?: (id: string | number, type: DiscussionEntityType) => void;
}> = ({
  reply,
  depth = 0,
  isLast = false,
  formatDate,
  canReply,
  canDelete,
  canEdit,
  onReply,
  onDelete,
  onEdit,
  onLike,
}) => {
  const formattedDate = formatDate
    ? formatDate(reply.createdAt)
    : new Date(reply.createdAt).toLocaleString();

  const hasNestedReplies = reply.replies && reply.replies.length > 0;
  const replyIsEdited = isEdited(reply.createdAt, reply.updatedAt);

  return (
    <div
      className={`${styles.replyWrapper} ${
        isLast && !hasNestedReplies ? styles.lastReply : ""
      }`}
    >
      {/* 連接線 */}
      <div className={styles.connector}>
        <div className={styles.connectorLine} />
        <div className={styles.connectorDot} />
      </div>

      <div className={styles.replyContent}>
        {/* 頭像 + 作者資訊 */}
        <div className={styles.authorRow}>
          <Avatar name={reply.authorUsername} url={reply.avatarUrl} size="sm" />
          <span className={styles.authorName}>
            {reply.authorUsername || "-"}
          </span>
          <span className={styles.dot}>·</span>
          <span className={styles.time}>{formattedDate}</span>
          {replyIsEdited && (
            <span className={styles.editedTag}>（已編輯）</span>
          )}
          {canEdit && onEdit && (
            <Button
              kind="ghost"
              size="sm"
              renderIcon={Edit}
              hasIconOnly
              iconDescription="編輯"
              onClick={() => onEdit(reply.id, "comment")}
              className={styles.editButton}
            />
          )}
          {canDelete && onDelete && (
            <Button
              kind="ghost"
              size="sm"
              renderIcon={TrashCan}
              hasIconOnly
              iconDescription="刪除"
              onClick={() => onDelete(reply.id, "comment")}
              className={styles.deleteButton}
            />
          )}
        </div>

        {/* 內容 */}
        <div className={styles.contentText}>
          <MarkdownRenderer>{reply.content}</MarkdownRenderer>
        </div>

        {/* 互動列 */}
        <div className={styles.actionRow}>
          <button
            type="button"
            className={`${styles.likeButton} ${
              reply.isLiked ? styles.liked : ""
            }`}
            onClick={() => onLike?.(reply.id, "comment")}
          >
            {reply.isLiked ? (
              <FavoriteFilled size={16} />
            ) : (
              <Favorite size={16} />
            )}
            <span>{reply.likeCount || 0} Likes</span>
          </button>
          {canReply && (
            <button
              type="button"
              className={styles.replyButton}
              onClick={() => onReply?.(reply.id, "comment")}
            >
              <Chat size={16} />
              <span>Reply</span>
            </button>
          )}
        </div>

        {/* 嵌套回覆 */}
        {hasNestedReplies && (
          <div className={styles.nestedReplies}>
            {reply.replies!.map((nestedReply, index) => (
              <ReplyItem
                key={nestedReply.id}
                reply={nestedReply}
                depth={depth + 1}
                isLast={index === reply.replies!.length - 1}
                formatDate={formatDate}
                canReply={canReply}
                canDelete={canDelete}
                canEdit={canEdit}
                onReply={onReply}
                onDelete={onDelete}
                onEdit={onEdit}
                onLike={onLike}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * 題目討論串元件
 * 顯示討論內容與嵌套回覆，支援按讚、回覆、編輯與刪除操作
 */
export const ProblemDiscussionThread: FC<ProblemDiscussionThreadProps> = ({
  id,
  content,
  problemTitle,
  replies,
  authorUsername,
  avatarUrl,
  createdAt,
  updatedAt,
  likeCount = 0,
  isLiked = false,
  onReply,
  onDelete,
  onEdit,
  onLike,
  canReply,
  canDelete,
  canEdit,
  formatDate,
}) => {
  const formattedDate = formatDate
    ? formatDate(createdAt)
    : new Date(createdAt).toLocaleString();

  const hasReplies = replies && replies.length > 0;
  const discussionIsEdited = isEdited(createdAt, updatedAt);

  return (
    <div className={styles.thread}>
      {/* 標籤區 */}
      {problemTitle && (
        <div className={styles.tagsRow}>
          <Tag type="blue" size="sm">
            {problemTitle}
          </Tag>
        </div>
      )}

      {/* 主討論區 */}
      <div className={styles.mainContent}>
        {/* 左側連接線區域 */}
        <div className={styles.threadLine}>
          <Avatar name={authorUsername} url={avatarUrl} />
          {hasReplies && <div className={styles.verticalLine} />}
        </div>

        {/* 右側內容區域 */}
        <div className={styles.contentArea}>
          {/* 作者資訊 */}
          <div className={styles.authorRow}>
            <span className={styles.authorName}>{authorUsername || "-"}</span>
            <span className={styles.dot}>·</span>
            <span className={styles.time}>{formattedDate}</span>
            {discussionIsEdited && (
              <span className={styles.editedTag}>（已編輯）</span>
            )}
            {canEdit && onEdit && (
              <Button
                kind="ghost"
                size="sm"
                renderIcon={Edit}
                hasIconOnly
                iconDescription="編輯"
                onClick={() => onEdit(id, "discussion")}
                className={styles.editButton}
              />
            )}
            {canDelete && onDelete && (
              <Button
                kind="ghost"
                size="sm"
                renderIcon={TrashCan}
                hasIconOnly
                iconDescription="刪除"
                onClick={() => onDelete(id, "discussion")}
                className={styles.deleteButton}
              />
            )}
          </div>

          {/* 內容 */}
          <div className={styles.contentText}>
            <MarkdownRenderer>{content}</MarkdownRenderer>
          </div>

          {/* 互動列 */}
          <div className={styles.actionRow}>
            <button
              type="button"
              className={`${styles.likeButton} ${isLiked ? styles.liked : ""}`}
              onClick={() => onLike?.(id, "discussion")}
            >
              {isLiked ? <FavoriteFilled size={16} /> : <Favorite size={16} />}
              <span>{likeCount} Likes</span>
            </button>
            {canReply && (
              <button
                type="button"
                className={styles.replyButton}
                onClick={() => onReply?.(id, "discussion")}
              >
                <Chat size={16} />
                <span>Reply</span>
              </button>
            )}
          </div>

          {/* 回覆列表 */}
          {hasReplies && (
            <div className={styles.repliesContainer}>
              {replies.map((reply, index) => (
                <ReplyItem
                  key={reply.id}
                  reply={reply}
                  isLast={index === replies.length - 1}
                  formatDate={formatDate}
                  canReply={canReply}
                  canDelete={canDelete}
                  canEdit={canEdit}
                  onReply={onReply}
                  onDelete={onDelete}
                  onEdit={onEdit}
                  onLike={onLike}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProblemDiscussionThread;
