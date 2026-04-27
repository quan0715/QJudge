import { describe, expect, it } from "vitest";

import { createEvidenceRingBuffer } from "./evidenceRingBuffer";

const blob = (name: string) => new Blob([name], { type: "image/webp" });

describe("createEvidenceRingBuffer", () => {
  it("returns frames inside the requested time window", () => {
    const buffer = createEvidenceRingBuffer({ retentionMs: 30_000 });

    buffer.add(blob("old"), 999);
    const middle = buffer.add(blob("middle"), 10_000);
    const current = buffer.add(blob("current"), 20_000);

    expect(buffer.getWindow(5_000, 20_000)).toEqual([middle, current]);
  });

  it("prunes frames older than retention", () => {
    const buffer = createEvidenceRingBuffer({ retentionMs: 30_000 });

    buffer.add(blob("old"), 999);
    buffer.add(blob("recent"), 31_000);

    expect(buffer.getWindow(0, 40_000)).toHaveLength(1);
  });

  it("caps max frames", () => {
    const buffer = createEvidenceRingBuffer({ retentionMs: 60_000, maxFrames: 2 });

    buffer.add(blob("one"), 1_000);
    buffer.add(blob("two"), 2_000);
    buffer.add(blob("three"), 3_000);

    expect(buffer.getWindow(0, 4_000).map((frame) => frame.id)).toEqual([2, 3]);
  });
});
