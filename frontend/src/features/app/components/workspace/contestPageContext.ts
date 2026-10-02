import type { PageContextSegment } from "@/core/types/chatbot.types";

/**
 * The contest provider keeps the previous contest while the routed one loads,
 * so a loaded contest only counts when its id matches the route.
 */
export function contestPageContext(
  routeContestId: string | null,
  loaded: { id: string; name: string } | null | undefined,
  listed: { contestId: string; contestName: string } | null | undefined,
): PageContextSegment | null {
  if (!routeContestId) return null;
  const label =
    loaded?.id === routeContestId
      ? loaded.name
      : listed?.contestId === routeContestId
        ? listed.contestName
        : null;
  return label
    ? { type: "contest", label, ids: { contest_id: routeContestId } }
    : null;
}
