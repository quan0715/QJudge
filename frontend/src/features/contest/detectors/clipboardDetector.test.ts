import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import type { TFunction } from "i18next";
import { IndexedDbIntegrityOutbox } from "@/infrastructure/browser/integrity/IndexedDbIntegrityOutbox";
import { buildClipboardMetadata, ClipboardDetector } from "./clipboardDetector";
import type { ViolationEvent } from "./types";

describe("ClipboardDetector", () => {
  it("preserves the browser callback timestamp across asynchronous hashing", async () => {
    const now = vi.spyOn(Date, "now")
      .mockReturnValueOnce(1_000)
      .mockReturnValue(9_999);
    const onViolation = vi.fn<(event: ViolationEvent) => void>();
    const detector = new ClipboardDetector(((key: string) => key) as TFunction);
    detector.start(onViolation);

    const handler = (detector as unknown as {
      handleCopyPaste: (event: ClipboardEvent) => void;
    }).handleCopyPaste;
    handler({
      type: "paste",
      target: document.createElement("textarea"),
      clipboardData: { getData: () => "captured text" },
    } as unknown as ClipboardEvent);
    await Promise.resolve();
    await Promise.resolve();

    expect(onViolation).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "clipboard_action",
      clientOccurredAtMs: 1_000,
    }));
    now.mockRestore();
    detector.stop();
  });

  it("truncates captured paste payloads before the durable outbox limit", async () => {
    const databaseName = `clipboard-detector-${crypto.randomUUID()}`;
    const outbox = await IndexedDbIntegrityOutbox.open({
      runId: "33333333-3333-3333-3333-333333333333",
      participantId: 44,
      deviceId: "device-a",
      registryVersion: "test",
      clientBuild: "test",
      databaseName,
      createId: () => "00000000-0000-4000-8000-000000000001",
    });
    const metadata = buildClipboardMetadata({
      action: "paste",
      rawText: "\\u0000".repeat(50_000),
      target: document.createElement("textarea"),
      sha256: "a".repeat(64),
    });
    const payload = {
      reason: "Clipboard action recorded",
      severity: "info",
      ...metadata,
    };

    await expect(outbox.append({
      eventType: "clipboard_action",
      clientOccurredAtMs: 1_000,
      payload,
    })).resolves.toMatchObject({ eventType: "clipboard_action" });
    expect(new TextEncoder().encode(JSON.stringify(payload)).byteLength).toBeLessThan(32 * 1024);
    await outbox.close();
    indexedDB.deleteDatabase(databaseName);
  });
});
