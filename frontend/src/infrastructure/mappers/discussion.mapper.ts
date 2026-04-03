import type {
  Discussion,
  DiscussionComment,
  DiscussionAuthor,
} from "@/core/entities/discussion.entity";
import type {
  DiscussionDto,
  DiscussionCommentDto,
  DiscussionAuthorDto,
} from "@/infrastructure/api/dto/discussion.dto";

export function mapDiscussionAuthorDto(dto: DiscussionAuthorDto): DiscussionAuthor {
  return {
    id: dto.id.toString(),
    username: dto.username,
    role: dto.role,
  };
}

export function mapDiscussionCommentDto(dto: DiscussionCommentDto): DiscussionComment {
  return {
    id: dto.id.toString(),
    content: dto.content,
    isDeleted: !!dto.is_deleted,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
    parentId: dto.parent?.toString() || null,
    likeCount: dto.like_count || 0,
    isLiked: !!dto.is_liked,
    author: mapDiscussionAuthorDto(dto.author),
    discussionId: dto.discussion?.toString(),
  };
}

export function mapDiscussionDto(dto: DiscussionDto): Discussion {
  return {
    id: dto.id.toString(),
    title: dto.title,
    content: dto.content,
    isDeleted: !!dto.is_deleted,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
    commentsCount: dto.comments_count || 0,
    comments: Array.isArray(dto.comments)
      ? dto.comments.map(mapDiscussionCommentDto)
      : [],
    likeCount: dto.like_count || 0,
    isLiked: !!dto.is_liked,
    author: mapDiscussionAuthorDto(dto.author),
    problemId: dto.problem?.toString(),
  };
}
