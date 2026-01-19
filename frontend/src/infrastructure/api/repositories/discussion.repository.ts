/**
 * Discussion Repository Implementation
 *
 * API endpoints for problem discussions and comments.
 */

import { httpClient, requestJson } from "@/infrastructure/api/http.client";
import type {
  Discussion,
  DiscussionComment,
  DiscussionListResponse,
  CommentListResponse,
} from "@/core/entities/discussion.entity";
import {
  mapDiscussionDto,
  mapCommentDto,
  mapDiscussionListResponse,
  mapCommentListResponse,
} from "@/infrastructure/mappers/discussion.mapper";

// ============================================================================
// Types
// ============================================================================

export interface CreateDiscussionPayload {
  title: string;
  content: string;
}

export interface UpdateDiscussionPayload {
  title?: string;
  content?: string;
}

export interface CreateCommentPayload {
  content: string;
  parent?: string;
}

export interface UpdateCommentPayload {
  content: string;
}

export interface LikeResponse {
  is_liked: boolean;
  like_count: number;
}

// ============================================================================
// Discussions
// ============================================================================

export const getDiscussions = async (
  problemId: string,
  params?: { page?: number; page_size?: number }
): Promise<DiscussionListResponse> => {
  const queryParams = new URLSearchParams();
  if (params?.page) queryParams.append("page", params.page.toString());
  if (params?.page_size)
    queryParams.append("page_size", params.page_size.toString());

  const query = queryParams.toString() ? `?${queryParams.toString()}` : "";
  const data = await requestJson<any>(
    httpClient.get(`/api/v1/problems/${problemId}/discussions/${query}`),
    "無法載入討論"
  );
  return mapDiscussionListResponse(data);
};

export const createDiscussion = async (
  problemId: string,
  payload: CreateDiscussionPayload
): Promise<Discussion> => {
  const data = await requestJson<any>(
    httpClient.post(`/api/v1/problems/${problemId}/discussions/`, payload),
    "無法建立討論"
  );
  return mapDiscussionDto(data);
};

export const getDiscussion = async (
  discussionId: string
): Promise<Discussion> => {
  const data = await requestJson<any>(
    httpClient.get(`/api/v1/problems/problem-discussions/${discussionId}/`),
    "無法載入討論"
  );
  return mapDiscussionDto(data);
};

export const updateDiscussion = async (
  discussionId: string,
  payload: UpdateDiscussionPayload
): Promise<Discussion> => {
  const data = await requestJson<any>(
    httpClient.patch(
      `/api/v1/problems/problem-discussions/${discussionId}/`,
      payload
    ),
    "無法更新討論"
  );
  return mapDiscussionDto(data);
};

export const deleteDiscussion = async (
  discussionId: string
): Promise<Discussion> => {
  const data = await requestJson<any>(
    httpClient.delete(`/api/v1/problems/problem-discussions/${discussionId}/`),
    "無法刪除討論"
  );
  return mapDiscussionDto(data);
};

// ============================================================================
// Comments
// ============================================================================

export const getComments = async (
  discussionId: string,
  params?: { page?: number; page_size?: number }
): Promise<CommentListResponse> => {
  const queryParams = new URLSearchParams();
  if (params?.page) queryParams.append("page", params.page.toString());
  if (params?.page_size)
    queryParams.append("page_size", params.page_size.toString());

  const query = queryParams.toString() ? `?${queryParams.toString()}` : "";
  const data = await requestJson<any>(
    httpClient.get(
      `/api/v1/problems/problem-discussions/${discussionId}/comments/${query}`
    ),
    "無法載入評論"
  );
  return mapCommentListResponse(data);
};

export const createComment = async (
  discussionId: string,
  payload: CreateCommentPayload
): Promise<DiscussionComment> => {
  const data = await requestJson<any>(
    httpClient.post(
      `/api/v1/problems/problem-discussions/${discussionId}/comments/`,
      payload
    ),
    "無法建立評論"
  );
  return mapCommentDto(data);
};

export const updateComment = async (
  commentId: string,
  payload: UpdateCommentPayload
): Promise<DiscussionComment> => {
  const data = await requestJson<any>(
    httpClient.patch(
      `/api/v1/problems/problem-discussion-comments/${commentId}/`,
      payload
    ),
    "無法更新評論"
  );
  return mapCommentDto(data);
};

export const deleteComment = async (
  commentId: string
): Promise<DiscussionComment> => {
  const data = await requestJson<any>(
    httpClient.delete(
      `/api/v1/problems/problem-discussion-comments/${commentId}/`
    ),
    "無法刪除評論"
  );
  return mapCommentDto(data);
};

// ============================================================================
// Likes
// ============================================================================

export const likeDiscussion = async (
  discussionId: string
): Promise<LikeResponse> => {
  return requestJson<LikeResponse>(
    httpClient.post(
      `/api/v1/problems/problem-discussions/${discussionId}/like/`
    ),
    "無法按讚"
  );
};

export const likeComment = async (commentId: string): Promise<LikeResponse> => {
  return requestJson<LikeResponse>(
    httpClient.post(
      `/api/v1/problems/problem-discussion-comments/${commentId}/like/`
    ),
    "無法按讚"
  );
};

// ============================================================================
// Default Export
// ============================================================================

export default {
  getDiscussions,
  createDiscussion,
  getDiscussion,
  updateDiscussion,
  deleteDiscussion,
  getComments,
  createComment,
  updateComment,
  deleteComment,
  likeDiscussion,
  likeComment,
};
