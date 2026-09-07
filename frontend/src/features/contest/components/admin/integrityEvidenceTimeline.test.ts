import { describe, expect, it } from "vitest";
import type { IntegrityEvidenceReviewItem } from "@/infrastructure/api/repositories/exam.repository";
import {
  buildEvidenceTimeSlices,
  filterEvidenceReviewItems,
  formatEvidenceRelativeRange,
} from "./integrityEvidenceTimeline";

const chunk = (
  chunkId: string,
  source: IntegrityEvidenceReviewItem["source"],
  startAtMs: number,
  endAtMs: number,
): IntegrityEvidenceReviewItem => ({
  chunkId,
  source,
  startAtMs,
  endAtMs,
  status: "verified",
  byteSize: 10,
  codec: "vp9",
  contentType: "video/webm",
  url: `https://example.test/${chunkId}.webm`,
});

describe("integrityEvidenceTimeline", () => {
  it("deduplicates chunk identities and hides transition fragments when normal evidence exists", () => {
    const normalScreen = chunk("screen-normal", "screen_share", 1_000, 6_000);
    const shortScreen = chunk("screen-short", "screen_share", 6_000, 6_200);
    const onlyWebcam = chunk("webcam-short", "webcam", 2_000, 2_300);

    expect(filterEvidenceReviewItems([
      normalScreen,
      normalScreen,
      shortScreen,
      onlyWebcam,
    ])).toEqual([normalScreen, onlyWebcam]);
  });

  it("groups screen and webcam by time and sorts slices chronologically", () => {
    const slices = buildEvidenceTimeSlices([
      chunk("screen-2", "screen_share", 10_000, 15_000),
      chunk("webcam-1", "webcam", 5_000, 10_000),
      chunk("screen-1", "screen_share", 5_000, 10_000),
    ]);

    expect(slices.map((slice) => [slice.startAtMs, slice.endAtMs])).toEqual([
      [5_000, 10_000],
      [10_000, 15_000],
    ]);
    expect(slices[0].items.map((item) => item.source)).toEqual([
      "screen_share",
      "webcam",
    ]);
  });

  it("labels a clip range relative to the selected incident", () => {
    expect(formatEvidenceRelativeRange(5_000, 10_000, 10_000)).toBe(
      "事件前 5 秒 – 事件當下",
    );
    expect(formatEvidenceRelativeRange(10_000, 15_000, 10_000)).toBe(
      "事件當下 – 事件後 5 秒",
    );
  });
});
