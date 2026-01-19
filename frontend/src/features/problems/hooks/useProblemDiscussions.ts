import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import {
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
} from "@/infrastructure/api/repositories/discussion.repository";
import type {
  Discussion,
  DiscussionComment,
  CreateDiscussionPayload,
  CreateCommentPayload,
  UpdateDiscussionPayload,
  UpdateCommentPayload,
} from "@/core/entities/discussion.entity";

const normalizeCommentPayload = (payload: CreateCommentPayload) => ({
  content: payload.content,
  parent: payload.parent != null ? String(payload.parent) : undefined,
});

// ============================================================================
// Query Keys Factory
// ============================================================================

export const discussionKeys = {
  all: ["discussions"] as const,
  lists: () => [...discussionKeys.all, "list"] as const,
  list: (problemId: string) => [...discussionKeys.lists(), problemId] as const,
  details: () => [...discussionKeys.all, "detail"] as const,
  detail: (discussionId: string) =>
    [...discussionKeys.details(), discussionId] as const,
  comments: (discussionId: string) =>
    [...discussionKeys.detail(discussionId), "comments"] as const,
};

// ============================================================================
// Discussion List Hook
// ============================================================================

interface UseDiscussionListOptions {
  enabled?: boolean;
  pageSize?: number;
}

/**
 * Hook for fetching and managing problem discussions list
 */
export function useDiscussionList(
  problemId: string | null | undefined,
  options: UseDiscussionListOptions = {}
) {
  const { enabled = true, pageSize = 20 } = options;
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const query = useQuery({
    queryKey: [...discussionKeys.list(problemId!), { page, pageSize }],
    queryFn: async () => {
      if (!problemId) return { results: [], count: 0 };
      return getDiscussions(problemId, { page, page_size: pageSize });
    },
    enabled: !!problemId && enabled,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });

  // Create discussion mutation
  const createMutation = useMutation({
    mutationFn: async (payload: CreateDiscussionPayload) => {
      if (!problemId) throw new Error("Problem ID required");
      return createDiscussion(problemId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: discussionKeys.list(problemId!),
      });
    },
  });

  // Delete discussion mutation
  const deleteMutation = useMutation({
    mutationFn: async (discussionId: string) => {
      return deleteDiscussion(discussionId);
    },
    onSuccess: (updatedDiscussion) => {
      // Update the discussion in cache to show is_deleted
      queryClient.setQueryData(
        discussionKeys.detail(updatedDiscussion.id),
        updatedDiscussion
      );
      queryClient.invalidateQueries({
        queryKey: discussionKeys.list(problemId!),
      });
    },
  });

  // Create comment mutation (for inline reply)
  const createCommentMutation = useMutation({
    mutationFn: async ({
      discussionId,
      payload,
    }: {
      discussionId: string;
      payload: CreateCommentPayload;
    }) => {
      return createComment(discussionId, normalizeCommentPayload(payload));
    },
    onSuccess: () => {
      // Refresh discussion list to show updated comment counts
      queryClient.invalidateQueries({
        queryKey: discussionKeys.list(problemId!),
      });
    },
  });

  // Like discussion mutation
  const likeDiscussionMutation = useMutation({
    mutationFn: async (discussionId: string) => {
      return likeDiscussion(discussionId);
    },
    onSuccess: (data, discussionId) => {
      // Optimistically update the discussion in the list
      queryClient.setQueryData(
        [...discussionKeys.list(problemId!), { page, pageSize }],
        (oldData: any) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            results: oldData.results.map((d: Discussion) =>
              d.id === discussionId
                ? { ...d, isLiked: data.is_liked, likeCount: data.like_count }
                : d
            ),
          };
        }
      );
    },
  });

  // Like comment mutation (for inline comment likes)
  const likeCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      return likeComment(commentId);
    },
    onSuccess: () => {
      // Refresh discussion list to get updated comment like status
      queryClient.invalidateQueries({
        queryKey: discussionKeys.list(problemId!),
      });
    },
  });

  // Delete comment mutation (for inline comment deletion)
  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      return deleteComment(commentId);
    },
    onSuccess: () => {
      // Refresh discussion list to update comment counts and list
      queryClient.invalidateQueries({
        queryKey: discussionKeys.list(problemId!),
      });
    },
  });

  // Update discussion mutation
  const updateDiscussionMutation = useMutation({
    mutationFn: async ({
      discussionId,
      payload,
    }: {
      discussionId: string;
      payload: UpdateDiscussionPayload;
    }) => {
      return updateDiscussion(discussionId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: discussionKeys.list(problemId!),
      });
    },
  });

  // Update comment mutation
  const updateCommentMutation = useMutation({
    mutationFn: async ({
      commentId,
      payload,
    }: {
      commentId: string;
      payload: UpdateCommentPayload;
    }) => {
      return updateComment(commentId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: discussionKeys.list(problemId!),
      });
    },
  });

  // Check if user can delete a discussion
  const canDelete = useCallback(
    (discussion: Discussion) => {
      if (!user) return false;
      // Author can delete their own
      if (discussion.author.id.toString() === user.id?.toString()) return true;
      // Admin or teacher can delete any
      if (user.role === "admin" || user.role === "teacher") return true;
      return false;
    },
    [user]
  );

  // Check if user can edit a discussion or comment (only author can edit)
  const canEdit = useCallback(
    (item: Discussion | DiscussionComment) => {
      if (!user) return false;
      // Only author can edit
      return item.author.id.toString() === user.id?.toString();
    },
    [user]
  );

  return {
    // Data
    discussions: query.data?.results || [],
    totalCount: query.data?.count || 0,
    page,
    pageSize,
    totalPages: Math.ceil((query.data?.count || 0) / pageSize),

    // Query state
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error as Error | null,

    // Actions
    setPage,
    refetch: query.refetch,

    // Mutations
    createDiscussion: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error as Error | null,

    deleteDiscussion: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    deleteError: deleteMutation.error as Error | null,

    // Comment mutations (for inline reply)
    createCommentOnDiscussion: createCommentMutation.mutateAsync,
    isCreatingComment: createCommentMutation.isPending,
    createCommentError: createCommentMutation.error as Error | null,

    // Like mutations
    toggleDiscussionLike: likeDiscussionMutation.mutateAsync,
    isLikingDiscussion: likeDiscussionMutation.isPending,
    toggleCommentLike: likeCommentMutation.mutateAsync,
    isLikingComment: likeCommentMutation.isPending,

    // Delete comment mutation (for inline comment deletion)
    deleteComment: deleteCommentMutation.mutateAsync,
    isDeletingComment: deleteCommentMutation.isPending,
    deleteCommentError: deleteCommentMutation.error as Error | null,

    // Update mutations
    updateDiscussion: updateDiscussionMutation.mutateAsync,
    isUpdatingDiscussion: updateDiscussionMutation.isPending,
    updateDiscussionError: updateDiscussionMutation.error as Error | null,

    updateComment: updateCommentMutation.mutateAsync,
    isUpdatingComment: updateCommentMutation.isPending,
    updateCommentError: updateCommentMutation.error as Error | null,

    // Permissions
    canDelete,
    canEdit,
    isAuthenticated: !!user,
  };
}

// ============================================================================
// Discussion Detail & Comments Hook
// ============================================================================

interface UseDiscussionDetailOptions {
  enabled?: boolean;
  pageSize?: number;
}

/**
 * Hook for fetching and managing a single discussion with its comments
 */
export function useDiscussionDetail(
  discussionId: string | null | undefined,
  options: UseDiscussionDetailOptions = {}
) {
  const { enabled = true, pageSize = 50 } = options;
  const [commentsPage, setCommentsPage] = useState(1);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Fetch discussion detail
  const discussionQuery = useQuery({
    queryKey: discussionKeys.detail(discussionId!),
    queryFn: async () => {
      if (!discussionId) return null;
      return getDiscussion(discussionId);
    },
    enabled: !!discussionId && enabled,
    staleTime: 1000 * 60 * 2,
  });

  // Fetch comments
  const commentsQuery = useQuery({
    queryKey: [
      ...discussionKeys.comments(discussionId!),
      { page: commentsPage, pageSize },
    ],
    queryFn: async () => {
      if (!discussionId) return { results: [], count: 0 };
      return getComments(discussionId, {
        page: commentsPage,
        page_size: pageSize,
      });
    },
    enabled: !!discussionId && enabled,
    staleTime: 1000 * 60 * 1, // 1 minute
  });

  // Create comment mutation
  const createCommentMutation = useMutation({
    mutationFn: async (payload: CreateCommentPayload) => {
      if (!discussionId) throw new Error("Discussion ID required");
      return createComment(discussionId, normalizeCommentPayload(payload));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: discussionKeys.comments(discussionId!),
      });
      // Also update the comments count on the discussion
      queryClient.invalidateQueries({
        queryKey: discussionKeys.detail(discussionId!),
      });
    },
  });

  // Delete comment mutation
  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      return deleteComment(commentId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: discussionKeys.comments(discussionId!),
      });
    },
  });

  // Like discussion mutation
  const likeDiscussionMutation = useMutation({
    mutationFn: async () => {
      if (!discussionId) throw new Error("Discussion ID required");
      return likeDiscussion(discussionId);
    },
    onSuccess: (data) => {
      // Update discussion in cache
      queryClient.setQueryData(
        discussionKeys.detail(discussionId!),
        (old: Discussion | null) =>
          old
            ? { ...old, isLiked: data.is_liked, likeCount: data.like_count }
            : old
      );
    },
  });

  // Like comment mutation
  const likeCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      return likeComment(commentId);
    },
    onSuccess: (data, commentId) => {
      // Update comment in cache
      queryClient.setQueryData(
        [
          ...discussionKeys.comments(discussionId!),
          { page: commentsPage, pageSize },
        ],
        (oldData: any) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            results: oldData.results.map((c: DiscussionComment) =>
              c.id === commentId
                ? { ...c, isLiked: data.is_liked, likeCount: data.like_count }
                : c
            ),
          };
        }
      );
    },
  });

  // Update comment mutation
  const updateCommentMutation = useMutation({
    mutationFn: async ({
      commentId,
      payload,
    }: {
      commentId: string;
      payload: UpdateCommentPayload;
    }) => {
      return updateComment(commentId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: discussionKeys.comments(discussionId!),
      });
    },
  });

  // Check if user can delete a comment
  const canDeleteComment = useCallback(
    (comment: DiscussionComment) => {
      if (!user) return false;
      // Author can delete their own
      if (comment.author.id.toString() === user.id?.toString()) return true;
      // Admin or teacher can delete any
      if (user.role === "admin" || user.role === "teacher") return true;
      return false;
    },
    [user]
  );

  // Check if user can edit a comment (only author can edit)
  const canEditComment = useCallback(
    (comment: DiscussionComment) => {
      if (!user) return false;
      // Only author can edit
      return comment.author.id.toString() === user.id?.toString();
    },
    [user]
  );

  // Check if discussion is deleted (cannot reply)
  const canReply = !discussionQuery.data?.isDeleted && !!user;

  return {
    // Discussion data
    discussion: discussionQuery.data,
    isDiscussionLoading: discussionQuery.isLoading,
    discussionError: discussionQuery.error as Error | null,

    // Comments data
    comments: commentsQuery.data?.results || [],
    commentsCount: commentsQuery.data?.count || 0,
    commentsPage,
    commentsTotalPages: Math.ceil((commentsQuery.data?.count || 0) / pageSize),
    isCommentsLoading: commentsQuery.isLoading,
    commentsError: commentsQuery.error as Error | null,

    // Actions
    setCommentsPage,
    refetch: () => {
      discussionQuery.refetch();
      commentsQuery.refetch();
    },

    // Mutations
    createComment: createCommentMutation.mutateAsync,
    isCreatingComment: createCommentMutation.isPending,
    createCommentError: createCommentMutation.error as Error | null,

    deleteComment: deleteCommentMutation.mutateAsync,
    isDeletingComment: deleteCommentMutation.isPending,
    deleteCommentError: deleteCommentMutation.error as Error | null,

    // Update comment mutation
    updateComment: updateCommentMutation.mutateAsync,
    isUpdatingComment: updateCommentMutation.isPending,
    updateCommentError: updateCommentMutation.error as Error | null,

    // Like mutations
    toggleDiscussionLike: likeDiscussionMutation.mutateAsync,
    isLikingDiscussion: likeDiscussionMutation.isPending,
    toggleCommentLike: likeCommentMutation.mutateAsync,
    isLikingComment: likeCommentMutation.isPending,

    // Permissions
    canReply,
    canDeleteComment,
    canEditComment,
    isAuthenticated: !!user,
  };
}

export default {
  useDiscussionList,
  useDiscussionDetail,
};
