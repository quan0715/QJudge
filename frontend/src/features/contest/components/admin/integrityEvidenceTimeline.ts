import type { IntegrityEvidenceReviewItem } from "@/infrastructure/api/repositories/exam.repository";

export interface EvidenceTimeSlice {
  startAtMs: number;
  endAtMs: number;
  items: IntegrityEvidenceReviewItem[];
}

const MIN_REVIEW_CLIP_MS = 1_000;

export const filterEvidenceReviewItems = (
  items: IntegrityEvidenceReviewItem[],
): IntegrityEvidenceReviewItem[] => {
  const unique = [...new Map(items.map((item) => [item.chunkId, item])).values()];
  const sourcesWithNormalClip = new Set(
    unique
      .filter((item) => item.endAtMs - item.startAtMs >= MIN_REVIEW_CLIP_MS)
      .map((item) => item.source),
  );
  return unique.filter(
    (item) =>
      !sourcesWithNormalClip.has(item.source) ||
      item.endAtMs - item.startAtMs >= MIN_REVIEW_CLIP_MS,
  );
};

export const buildEvidenceTimeSlices = (
  items: IntegrityEvidenceReviewItem[],
): EvidenceTimeSlice[] => {
  const slices = new Map<string, EvidenceTimeSlice>();
  for (const item of items) {
    const key = `${item.startAtMs}:${item.endAtMs}`;
    const slice = slices.get(key) ?? {
      startAtMs: item.startAtMs,
      endAtMs: item.endAtMs,
      items: [],
    };
    slice.items.push(item);
    slices.set(key, slice);
  }
  const sourceOrder = { screen_share: 0, webcam: 1 } as const;
  return [...slices.values()]
    .map((slice) => ({
      ...slice,
      items: [...slice.items].sort(
        (left, right) => sourceOrder[left.source] - sourceOrder[right.source],
      ),
    }))
    .sort((left, right) => left.startAtMs - right.startAtMs);
};

export type EvidenceTranslate = (
  key: string,
  defaultValue: string,
  values?: { seconds: number },
) => string;

const defaultTranslate: EvidenceTranslate = (_key, defaultValue, values) =>
  defaultValue.replace("{{seconds}}", String(values?.seconds ?? ""));

const relativePoint = (valueMs: number, translate: EvidenceTranslate): string => {
  const seconds = Math.round(Math.abs(valueMs) / 1000);
  if (seconds === 0) return translate("logs.detail.relative.atEvent", "事件當下");
  return valueMs < 0
    ? translate("logs.detail.relative.before", "事件前 {{seconds}} 秒", { seconds })
    : translate("logs.detail.relative.after", "事件後 {{seconds}} 秒", { seconds });
};

export const formatEvidenceRelativeRange = (
  startAtMs: number,
  endAtMs: number,
  occurredAtMs: number,
  translate: EvidenceTranslate = defaultTranslate,
): string =>
  `${relativePoint(startAtMs - occurredAtMs, translate)} – ${relativePoint(endAtMs - occurredAtMs, translate)}`;
