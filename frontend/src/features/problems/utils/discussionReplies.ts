import type { DiscussionComment } from "@/core/entities/discussion.entity";
import type { DiscussionReply } from "@/shared/ui/discussion";

interface BuildRepliesOptions {
  includeDeleted?: boolean;
  deletedText?: string;
}

export const buildDiscussionReplies = (
  comments: DiscussionComment[],
  options: BuildRepliesOptions = {}
): DiscussionReply[] => {
  const { includeDeleted = false, deletedText = "此評論已被刪除" } = options;
  const replyMap = new Map<string, DiscussionReply>();
  const rootReplies: DiscussionReply[] = [];

  for (const comment of comments) {
    if (comment.isDeleted && !includeDeleted) continue;

    replyMap.set(comment.id, {
      id: comment.id,
      content: comment.isDeleted ? deletedText : comment.content,
      authorUsername: comment.author.username,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      likeCount: comment.likeCount,
      isLiked: comment.isLiked,
      replies: [],
    });
  }

  for (const comment of comments) {
    if (comment.isDeleted && !includeDeleted) continue;

    const reply = replyMap.get(comment.id);
    if (!reply) continue;

    if (comment.parentId && replyMap.has(comment.parentId)) {
      const parent = replyMap.get(comment.parentId);
      parent?.replies?.push(reply);
    } else {
      rootReplies.push(reply);
    }
  }

  return rootReplies;
};
