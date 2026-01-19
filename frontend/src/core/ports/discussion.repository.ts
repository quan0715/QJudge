import type {
  Discussion,
  DiscussionComment,
  DiscussionListResponse,
  CommentListResponse,
} from "@/core/entities/discussion.entity";

// ============================================================================
// Query Parameters
// ============================================================================

export interface GetDiscussionsParams {
  problem_id?: string;
  page?: number;
  page_size?: number;
}

export interface GetCommentsParams {
  page?: number;
  page_size?: number;
}

// ============================================================================
// Payload Types
// ============================================================================

export interface CreateDiscussionPayload {
  title: string;
  content: string;
  problem_id?: string;
}

export interface UpdateDiscussionPayload {
  title?: string;
  content?: string;
}

export interface CreateCommentPayload {
  content: string;
  parent_id?: string;
}

// ============================================================================
// Port Interface
// ============================================================================

export interface IDiscussionRepository {
  // Discussion CRUD
  getDiscussions(params?: GetDiscussionsParams): Promise<DiscussionListResponse>;
  getDiscussion(id: string): Promise<Discussion>;
  createDiscussion(data: CreateDiscussionPayload): Promise<Discussion>;
  updateDiscussion(id: string, data: UpdateDiscussionPayload): Promise<Discussion>;
  deleteDiscussion(id: string): Promise<void>;

  // Discussion Likes
  likeDiscussion(id: string): Promise<void>;
  unlikeDiscussion(id: string): Promise<void>;

  // Comments
  getComments(
    discussionId: string,
    params?: GetCommentsParams
  ): Promise<CommentListResponse>;
  createComment(
    discussionId: string,
    data: CreateCommentPayload
  ): Promise<DiscussionComment>;
  deleteComment(discussionId: string, commentId: string): Promise<void>;

  // Comment Likes
  likeComment(discussionId: string, commentId: string): Promise<void>;
  unlikeComment(discussionId: string, commentId: string): Promise<void>;
}
