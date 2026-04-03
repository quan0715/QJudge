import { httpClient, requestJson, ensureOk } from "@/infrastructure/api/http.client";
import { buildQuery } from "@/infrastructure/api/utils/buildQuery.client";
import type {
  Discussion,
  DiscussionComment,
  DiscussionListResponse,
  CommentListResponse,
} from "@/core/entities/discussion.entity";
import type {
  IDiscussionRepository,
  GetDiscussionsParams,
  GetCommentsParams,
  CreateDiscussionPayload,
  UpdateDiscussionPayload,
  CreateCommentPayload,
} from "@/core/ports/discussion.repository";
import {
  mapDiscussionDto,
  mapDiscussionCommentDto,
} from "@/infrastructure/mappers/discussion.mapper";
import type {
  DiscussionDto,
  DiscussionCommentDto,
  DiscussionListDto,
  CommentListDto,
} from "@/infrastructure/api/dto/discussion.dto";

// ============================================================================
// Discussion Repository Implementation
// ============================================================================

export const getDiscussions = async (
  params?: GetDiscussionsParams
): Promise<DiscussionListResponse> => {
  const query = buildQuery(params as Record<string, unknown>);
  const data = await requestJson<DiscussionListDto>(
    httpClient.get(`/api/v1/discussions/${query}`),
    "Failed to fetch discussions"
  );
  return {
    results: (data.results || []).map(mapDiscussionDto),
    count: data.count || 0,
    next: data.next,
    previous: data.previous,
  };
};

export const getDiscussion = async (id: string): Promise<Discussion> => {
  const data = await requestJson<DiscussionDto>(
    httpClient.get(`/api/v1/discussions/${id}/`),
    "Failed to fetch discussion"
  );
  return mapDiscussionDto(data);
};

export const createDiscussion = async (
  payload: CreateDiscussionPayload
): Promise<Discussion> => {
  const data = await requestJson<DiscussionDto>(
    httpClient.post(`/api/v1/discussions/`, {
      title: payload.title,
      content: payload.content,
      problem: payload.problem_id,
    }),
    "Failed to create discussion"
  );
  return mapDiscussionDto(data);
};

export const updateDiscussion = async (
  id: string,
  payload: UpdateDiscussionPayload
): Promise<Discussion> => {
  const data = await requestJson<DiscussionDto>(
    httpClient.patch(`/api/v1/discussions/${id}/`, payload),
    "Failed to update discussion"
  );
  return mapDiscussionDto(data);
};

export const deleteDiscussion = async (id: string): Promise<void> => {
  await ensureOk(
    httpClient.delete(`/api/v1/discussions/${id}/`),
    "Failed to delete discussion"
  );
};

// Comments
export const getComments = async (
  discussionId: string,
  params?: GetCommentsParams
): Promise<CommentListResponse> => {
  const query = buildQuery(params as Record<string, unknown>);
  const data = await requestJson<CommentListDto>(
    httpClient.get(`/api/v1/comments/${query}${query ? '&' : '?'}discussion=${discussionId}`),
    "Failed to fetch comments"
  );
  return {
    results: (data.results || []).map(mapDiscussionCommentDto),
    count: data.count || 0,
    next: data.next,
    previous: data.previous,
  };
};

export const createComment = async (
  discussionId: string,
  payload: CreateCommentPayload
): Promise<DiscussionComment> => {
  const data = await requestJson<DiscussionCommentDto>(
    httpClient.post(`/api/v1/comments/`, {
      content: payload.content,
      parent: payload.parent_id,
      discussion: discussionId,
    }),
    "Failed to create comment"
  );
  return mapDiscussionCommentDto(data);
};

export const deleteComment = async (_discussionId: string, commentId: string): Promise<void> => {
  await ensureOk(
    httpClient.delete(`/api/v1/comments/${commentId}/`),
    "Failed to delete comment"
  );
};

// Social (Likes)
export const likeDiscussion = async (id: string): Promise<void> => {
  await ensureOk(
    httpClient.post(`/api/v1/discussions/${id}/toggle_like/`),
    "Failed to like discussion"
  );
};

export const unlikeDiscussion = async (id: string): Promise<void> => {
  // Our backend uses toggle_like, so unlike is the same call
  await ensureOk(
    httpClient.post(`/api/v1/discussions/${id}/toggle_like/`),
    "Failed to unlike discussion"
  );
};

export const likeComment = async (_discussionId: string, commentId: string): Promise<void> => {
  await ensureOk(
    httpClient.post(`/api/v1/comments/${commentId}/toggle_like/`),
    "Failed to like comment"
  );
};

export const unlikeComment = async (_discussionId: string, commentId: string): Promise<void> => {
  await ensureOk(
    httpClient.post(`/api/v1/comments/${commentId}/toggle_like/`),
    "Failed to unlike comment"
  );
};

// ============================================================================
// Repository Instance
// ============================================================================

export const discussionRepository: IDiscussionRepository = {
  getDiscussions,
  getDiscussion,
  createDiscussion,
  updateDiscussion,
  deleteDiscussion,
  likeDiscussion,
  unlikeDiscussion,
  getComments,
  createComment,
  deleteComment,
  likeComment,
  unlikeComment,
};

export default discussionRepository;
