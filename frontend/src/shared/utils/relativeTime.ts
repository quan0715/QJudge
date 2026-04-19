/**
 * Returns a compact relative time string for display in chat session lists.
 * Compact format: "Just now", "3h", "1d", "4d", "2w", or localized date for older.
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    return diffHours === 0 ? "Just now" : `${diffHours}h`;
  }
  if (diffDays === 1) return "1d";
  if (diffDays < 7) return `${diffDays}d`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) return `${diffWeeks}w`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
