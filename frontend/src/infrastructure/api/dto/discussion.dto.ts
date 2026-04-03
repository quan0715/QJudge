export interface DiscussionAuthorDto {
  id: number | string;
  username: string;
  role?: "student" | "teacher" | "admin";
}

export interface DiscussionCommentDto {
  id: number | string;
  content: string;
  is_deleted?: boolean;
  created_at: string;
  updated_at: string;
  parent?: number | string | null;
  like_count?: number;
  is_liked?: boolean;
  author: DiscussionAuthorDto;
  discussion?: number | string;
}

export interface DiscussionDto {
  id: number | string;
  title: string;
  content: string;
  is_deleted?: boolean;
  created_at: string;
  updated_at: string;
  comments_count?: number;
  comments?: DiscussionCommentDto[];
  like_count?: number;
  is_liked?: boolean;
  author: DiscussionAuthorDto;
  problem?: number | string;
}

export interface DiscussionListDto {
  results?: DiscussionDto[];
  count?: number;
  next?: string | null;
  previous?: string | null;
}

export interface CommentListDto {
  results?: DiscussionCommentDto[];
  count?: number;
  next?: string | null;
  previous?: string | null;
}
