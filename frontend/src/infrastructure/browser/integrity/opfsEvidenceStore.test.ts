import "fake-indexeddb/auto";
import { Blob as NodeBlob } from "node:buffer";
import { afterEach, describe, expect, it } from "vitest";

import { OpfsEvidenceStore, type OpfsDirectory } from "./opfsEvidenceStore";

class MemoryDirectory implements OpfsDirectory {
  readonly files = new Map<string, Blob>();
  readonly writeOrder: string[] = [];

  async getDirectoryHandle(name: string): Promise<OpfsDirectory> {
    return this;
  }

  async getFileHandle(name: string, options?: { create?: boolean }) {
    return {
      getFile: async () => {
        const file = this.files.get(name);
        if (!file) throw new DOMException("missing", "NotFoundError");
        return file;
      },
      createWritable: async () => ({
        write: async (value: Blob) => {
          this.writeOrder.push("write");
          this.files.set(name, value);
        },
        flush: async () => this.writeOrder.push("flush"),
        close: async () => this.writeOrder.push("close"),
      }),
    };
  }

  async removeEntry(name: string): Promise<void> {
    this.files.delete(name);
  }
}

describe("OpfsEvidenceStore", () => {
  const names: string[] = [];

  afterEach(async () => {
    await Promise.all(names.splice(0).map((name) => new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    })));
  });

  it("writes media bytes to OPFS before committing its descriptor", async () => {
    const databaseName = `evidence-store-${crypto.randomUUID()}`;
    names.push(databaseName);
    const opfs = new MemoryDirectory();
    const store = await OpfsEvidenceStore.open({
      runId: "33333333-3333-3333-3333-333333333333",
      deviceId: "device-a",
      databaseName,
      opfs,
      createId: () => "44444444-4444-4444-8444-444444444444",
    });

    const descriptor = await store.putChunk({
      source: "screen_share",
      recordingSessionId: "55555555-5555-4555-8555-555555555555",
      epochId: "66666666-6666-4666-8666-666666666666",
      chunkSeq: 1,
      isInitChunk: true,
      previousSha256: "",
      startAtMs: 1_000,
      endAtMs: 6_000,
      codec: "video/webm;codecs=vp8",
      bytes: new NodeBlob(["webm-init"], { type: "video/webm" }) as unknown as Blob,
    });

    expect(opfs.writeOrder).toEqual(["write", "flush", "close"]);
    expect(descriptor.localAvailability).toBe("available");
    expect(descriptor.sha256).toMatch(/^[0-9a-f]{64}$/);
    await store.close();
  });

  it("uses IndexedDB blobs when OPFS is unavailable", async () => {
    const databaseName = `evidence-store-${crypto.randomUUID()}`;
    names.push(databaseName);
    const store = await OpfsEvidenceStore.open({
      runId: "33333333-3333-3333-3333-333333333333",
      deviceId: "device-a",
      databaseName,
      opfs: null,
      createId: () => "44444444-4444-4444-8444-444444444444",
    });

    const descriptor = await store.putChunk({
      source: "screen_share",
      recordingSessionId: "55555555-5555-4555-8555-555555555555",
      epochId: "66666666-6666-4666-8666-666666666666",
      chunkSeq: 1,
      isInitChunk: true,
      previousSha256: "",
      startAtMs: 1_000,
      endAtMs: 6_000,
      codec: "video/webm;codecs=vp8",
      bytes: new NodeBlob(["webm-init"], { type: "video/webm" }) as unknown as Blob,
    });

    expect(await (await store.getBlob(descriptor))?.text()).toBe("webm-init");
    expect(await store.pendingDescriptorSummaries()).toHaveLength(1);
    await store.deleteDescriptor(descriptor);
    expect(await store.listDescriptors()).toEqual([]);
    await store.close();
  });
});
