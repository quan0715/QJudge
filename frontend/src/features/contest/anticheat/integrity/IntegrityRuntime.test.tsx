import { describe, expect, it, vi } from "vitest";
import type { ExamIntegrityOutbox } from "@/core/ports/examIntegrity.port";
import { contestIntegritySourceFiles, createIntegrityRuntime } from "./useIntegrityRuntime";

const createOutboxMock = (): Pick<ExamIntegrityOutbox, "append"> => ({
  append: vi.fn().mockResolvedValue({}),
});

describe("IntegrityRuntime", () => {
  it("persists a detector signal before resolving emit", async () => {
    const outbox = createOutboxMock();
    const runtime = createIntegrityRuntime({ outbox });

    await runtime.emit({
      eventType: "exit_fullscreen_triggered",
      clientOccurredAtMs: 1_000,
      payload: { fullscreen: false },
    });

    expect(outbox.append).toHaveBeenCalledWith({
      eventType: "exit_fullscreen_triggered",
      clientOccurredAtMs: 1_000,
      payload: { fullscreen: false },
    });
  });

  it("does not add timers, dedupe, priority, grace, or actions in detector runtime", async () => {
    const outbox = createOutboxMock();
    const runtime = createIntegrityRuntime({ outbox });

    await runtime.emit({
      eventType: "mouse_leave_triggered",
      clientOccurredAtMs: 1_000,
      payload: {},
    });
    await runtime.emit({
      eventType: "mouse_leave_triggered",
      clientOccurredAtMs: 1_001,
      payload: {},
    });

    expect(outbox.append).toHaveBeenCalledTimes(2);
  });

  it("accepts a registry-only event without changing transport core", async () => {
    const outbox = createOutboxMock();
    const runtime = createIntegrityRuntime({
      outbox,
      registry: {
        version: "registry-v2",
        definitions: {
          head_pose: {
            signals: {
              triggered: "head_pose_changed",
              escalated: "",
              restored: "",
            },
            emission: "sample",
          },
        },
      },
    });

    await runtime.emit({
      eventType: "head_pose_changed",
      clientOccurredAtMs: 2_000,
      payload: {},
    });

    expect(outbox.append).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "head_pose_changed" }),
    );
  });

  it("contains no legacy direct event transport imports", async () => {
    const sourceFiles = await contestIntegritySourceFiles();
    for (const source of sourceFiles) {
      expect(source.text).not.toMatch(/\brecordExamEvent(?:WithForcedCapture)?\b/);
      expect(source.text).not.toMatch(/\buseForceSubmitArbiter\b/);
      expect(source.text).not.toMatch(/\buseViolationPipeline\b/);
    }
  });
});
