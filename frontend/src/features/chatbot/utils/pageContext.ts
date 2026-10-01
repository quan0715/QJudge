import type { PageContext, PageContextSegment } from "@/core/types/chatbot.types";

// Limits enforced by the AI service when it validates `page_context`.
const MAX_LABEL_LENGTH = 200;
const MAX_ID_LENGTH = 64;
const MAX_PATH_LENGTH = 500;

interface LocationLike {
  pathname: string;
  search: string;
}

function toSendableSegment(segment: PageContextSegment): PageContextSegment {
  const ids = Object.fromEntries(
    Object.entries(segment.ids).filter(
      ([key, value]) =>
        key.length > 0 &&
        key.length <= MAX_ID_LENGTH &&
        value.length > 0 &&
        value.length <= MAX_ID_LENGTH,
    ),
  );
  return { ...segment, label: segment.label.slice(0, MAX_LABEL_LENGTH), ids };
}

/**
 * Only the pathname and the admin `panel` are sent: other query parameters can
 * carry arbitrary text from a pasted link into a block the agent treats as trusted.
 */
function toSendablePath({ pathname, search }: LocationLike): string {
  const panel = new URLSearchParams(search).get("panel");
  const path = panel ? `${pathname}?panel=${encodeURIComponent(panel)}` : pathname;
  return path.slice(0, MAX_PATH_LENGTH);
}

/** Shapes the published page segments into a payload the AI service accepts. */
export function buildPageContext(
  location: LocationLike,
  segments: readonly PageContextSegment[],
): PageContext {
  return {
    path: toSendablePath(location),
    segments: segments.map(toSendableSegment),
  };
}
