import type {
  Discussion,
  DiscussionComment,
  DiscussionAuthor,
  DiscussionListResponse,
  CommentListResponse,
} from "@/core/entities/discussion.entity";

/**
 * Map author DTO to DiscussionAuthor entity
 */
export function mapAuthorDto(dto: any): DiscussionAuthor {
  return {
    id: dto?.id?.toString() || '',
    username: dto?.username || '未知用戶',
    role: dto?.role,
  };
}

/**
 * Map discussion DTO from API to Discussion entity
 */
export function mapDiscussionDto(dto: any): Discussion {
  // Map embedded comments if present
  const comments = Array.isArray(dto.comments)
    ? dto.comments.map(mapCommentDto)
    : [];

  return {
    id: dto.id?.toString() || '',
    title: dto.title || '',
    content: dto.content || '',
    isDeleted: !!dto.is_deleted,
    createdAt: dto.created_at || dto.createdAt || '',
    updatedAt: dto.updated_at || dto.updatedAt || '',
    commentsCount: dto.comments_count ?? dto.commentsCount ?? 0,
    comments,
    likeCount: dto.like_count ?? dto.likeCount ?? 0,
    isLiked: !!dto.is_liked,
    author: mapAuthorDto(dto.user || dto.author),
    problemId: dto.problem?.toString() || dto.problem_id?.toString(),
  };
}

/**
 * Map comment DTO from API to DiscussionComment entity
 */
export function mapCommentDto(dto: any): DiscussionComment {
  return {
    id: dto.id?.toString() || '',
    content: dto.content || '',
    isDeleted: !!dto.is_deleted,
    createdAt: dto.created_at || dto.createdAt || '',
    updatedAt: dto.updated_at || dto.updatedAt || '',
    parentId: dto.parent?.toString() || null,
    likeCount: dto.like_count ?? dto.likeCount ?? 0,
    isLiked: !!dto.is_liked,
    author: mapAuthorDto(dto.user || dto.author),
    discussionId: dto.discussion?.toString() || dto.discussion_id?.toString(),
  };
}

/**
 * Map paginated discussion list response
 */
export function mapDiscussionListResponse(data: any): DiscussionListResponse {
  const results = data.results || data;
  return {
    results: Array.isArray(results) ? results.map(mapDiscussionDto) : [],
    count: data.count || (Array.isArray(results) ? results.length : 0),
    next: data.next || null,
    previous: data.previous || null,
  };
}

/**
 * Map paginated comment list response
 */
export function mapCommentListResponse(data: any): CommentListResponse {
  const results = data.results || data;
  return {
    results: Array.isArray(results) ? results.map(mapCommentDto) : [],
    count: data.count || (Array.isArray(results) ? results.length : 0),
    next: data.next || null,
    previous: data.previous || null,
  };
}
