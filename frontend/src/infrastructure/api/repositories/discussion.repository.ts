import { httpClient, requestJson, ensureOk } from "@/infrastructure/api/http.client";
import type {
  Discussion,
  DiscussionComment,
  CreateDiscussionPayload,
  CreateCommentPayload,
  UpdateDiscussionPayload,
  UpdateCommentPayload,
  DiscussionListResponse,
  CommentListResponse,
} from "@/core/entities/discussion.entity";
import type { IDiscussionRepository } from "@/core/ports/discussion.repository";
import {
  mapDiscussionDto,
  mapDiscussionCommentDto,
} from "@/infrastructure/mappers/discussion.mapper";
import type {
  DiscussionDto,
  DiscussionCommentDto,
  DiscussionListDto,
  CommentListDto,
} from "../api/dto/discussion.dto";

// ============================================================================
// Discussion Repository Implementation
// ============================================================================

export const getDiscussions = async (
  problemId: string,
  page = 1
): Promise<DiscussionListResponse> => {
  const data = await requestJson<DiscussionListDto>(
    httpClient.get(`/api/v1/discussions/?problem=${problemId}&page=${page}`),
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
  problemId: string,
  payload: CreateDiscussionPayload
): Promise<Discussion> => {
  const data = await requestJson<DiscussionDto>(
    httpClient.post(`/api/v1/discussions/`, {
      ...payload,
      problem: problemId,
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
  page = 1
): Promise<CommentListResponse> => {
  const data = await requestJson<CommentListDto>(
    httpClient.get(`/api/v1/comments/?discussion=${discussionId}&page=${page}`),
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
      ...payload,
      discussion: discussionId,
    }),
    "Failed to create comment"
  );
  return mapDiscussionCommentDto(data);
};

export const updateComment = async (
  id: string,
  payload: UpdateCommentPayload
): Promise<DiscussionComment> => {
  const data = await requestJson<DiscussionCommentDto>(
    httpClient.patch(`/api/v1/comments/${id}/`, payload),
    "Failed to update comment"
  );
  return mapDiscussionCommentDto(data);
};

export const deleteComment = async (id: string): Promise<void> => {
  await ensureOk(
    httpClient.delete(`/api/v1/comments/${id}/`),
    "Failed to delete comment"
  );
};

// Social
export const toggleLikeDiscussion = async (id: string): Promise<void> => {
  await ensureOk(
    httpClient.post(`/api/v1/discussions/${id}/toggle_like/`),
    "Failed to toggle like"
  );
};

export const toggleLikeComment = async (id: string): Promise<void> => {
  await ensureOk(
    httpClient.post(`/api/v1/comments/${id}/toggle_like/`),
    "Failed to toggle like"
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
  getComments,
  createComment,
  updateComment,
  deleteComment,
  toggleLikeDiscussion,
  toggleLikeComment,
};

export default discussionRepository;
