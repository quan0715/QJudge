import type { UserRole } from './user.entity';

/**
 * Author information for discussions and comments
 */
export interface DiscussionAuthor {
  id: string | number;
  username: string;
  role?: UserRole;
}

/**
 * Discussion entity - represents a discussion thread on a problem
 */
export interface Discussion {
  id: string;
  title: string;
  content: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  commentsCount: number;
  comments: DiscussionComment[];
  likeCount: number;
  isLiked: boolean;
  author: DiscussionAuthor;
  problemId?: string;
}

/**
 * Comment entity - represents a comment on a discussion
 */
export interface DiscussionComment {
  id: string;
  content: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  parentId?: string | null;
  likeCount: number;
  isLiked: boolean;
  author: DiscussionAuthor;
  discussionId?: string;
}

/**
 * Payload for creating a new discussion
 */
export interface CreateDiscussionPayload {
  title: string;
  content: string;
}

/**
 * Payload for creating a new comment
 */
export interface CreateCommentPayload {
  content: string;
  parent?: string | number | null;
}

/**
 * Payload for updating a discussion
 */
export interface UpdateDiscussionPayload {
  title?: string;
  content?: string;
}

/**
 * Payload for updating a comment
 */
export interface UpdateCommentPayload {
  content: string;
}

/**
 * Discussion list response (paginated)
 */
export interface DiscussionListResponse {
  results: Discussion[];
  count: number;
  next?: string | null;
  previous?: string | null;
}

/**
 * Comment list response (paginated)
 */
export interface CommentListResponse {
  results: DiscussionComment[];
  count: number;
  next?: string | null;
  previous?: string | null;
}
