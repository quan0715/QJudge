import type { IntegrityEvidenceReviewItem } from "@/infrastructure/api/repositories/exam.repository";

export interface EvidenceTimeSlice {
  startAtMs: number;
  endAtMs: number;
  items: IntegrityEvidenceReviewItem[];
}

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

const relativePoint = (valueMs: number): string => {
  const seconds = Math.round(Math.abs(valueMs) / 1000);
  if (seconds === 0) return "事件當下";
  return valueMs < 0 ? `事件前 ${seconds} 秒` : `事件後 ${seconds} 秒`;
};

export const formatEvidenceRelativeRange = (
  startAtMs: number,
  endAtMs: number,
  occurredAtMs: number,
): string =>
  `${relativePoint(startAtMs - occurredAtMs)} – ${relativePoint(endAtMs - occurredAtMs)}`;
