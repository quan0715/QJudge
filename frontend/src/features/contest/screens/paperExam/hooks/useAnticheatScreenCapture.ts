import { useCallback, useEffect, useRef, useState } from "react";
import {
  getAnticheatUrls,
  recordExamEvent,
  type AnticheatUploadItem,
} from "@/infrastructure/api/repositories/exam.repository";
import {
  getExamCaptureNextSeq,
  getExamCaptureSessionId,
  setExamCaptureNextSeq,
  setExamCaptureSessionId,
} from "./examCaptureSession";
import {
  consumePrecheckScreenShareHandoff,
} from "./examScreenShareHandoff";

const CAPTURE_BASE_INTERVAL_MS = 10_000;
const CAPTURE_JITTER_RATIO = 0.3; // ±30% → 7–13 秒
const MAX_FRAME_BYTES = 50 * 1024;
const MAX_IDB_QUEUE = 200;
const MAX_MEMORY_QUEUE = 30;
const URL_BATCH_COUNT = 30;
const DEGRADE_REPORT_COOLDOWN_MS = 60_000;

const IDB_DB_NAME = "qjudge_anticheat_capture";
const IDB_DB_VERSION = 1;
const IDB_STORE_NAME = "frames";

type PendingFrame = {
  id: number;
  createdAt: number;
  blob: Blob;
};

type QueueStore = {
  mode: "indexeddb" | "memory";
  enqueue: (blob: Blob) => Promise<void>;
  peek: (limit: number) => Promise<PendingFrame[]>;
  remove: (ids: number[]) => Promise<void>;
  count: () => Promise<number>;
};

const createMemoryQueueStore = (): QueueStore => {
  const queue: PendingFrame[] = [];
  let nextId = 1;

  return {
    mode: "memory",
    enqueue: async (blob) => {
      if (queue.length >= MAX_MEMORY_QUEUE) queue.shift();
      queue.push({ id: nextId++, createdAt: Date.now(), blob });
    },
    peek: async (limit) => queue.slice(0, limit),
    remove: async (ids) => {
      if (!ids.length) return;
      const idSet = new Set(ids);
      for (let i = queue.length - 1; i >= 0; i -= 1) {
        if (idSet.has(queue[i].id)) queue.splice(i, 1);
      }
    },
    count: async () => queue.length,
  };
};

const openIndexedDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = window.indexedDB.open(IDB_DB_NAME, IDB_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        db.createObjectStore(IDB_STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open indexedDB"));
  });

const createIndexedDbQueueStore = async (): Promise<QueueStore> => {
  const db = await openIndexedDb();

  const count = () =>
    new Promise<number>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, "readonly");
      const request = tx.objectStore(IDB_STORE_NAME).count();
      request.onsuccess = () => resolve(Number(request.result || 0));
      request.onerror = () => reject(request.error || new Error("Failed to count frames"));
    });

  const deleteOldest = () =>
    new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, "readwrite");
      const store = tx.objectStore(IDB_STORE_NAME);
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          store.delete(cursor.primaryKey);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Failed to delete oldest frame"));
    });

  const enqueue = async (blob: Blob) => {
    if ((await count()) >= MAX_IDB_QUEUE) {
      await deleteOldest();
    }

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, "readwrite");
      tx.objectStore(IDB_STORE_NAME).add({ createdAt: Date.now(), blob });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Failed to enqueue frame"));
    });
  };

  const peek = (limit: number) =>
    new Promise<PendingFrame[]>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, "readonly");
      const store = tx.objectStore(IDB_STORE_NAME);
      const cursorReq = store.openCursor();
      const rows: PendingFrame[] = [];

      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || rows.length >= limit) {
          resolve(rows);
          return;
        }
        const value = cursor.value as PendingFrame;
        rows.push({
          id: Number(value.id),
          createdAt: Number(value.createdAt || 0),
          blob: value.blob,
        });
        cursor.continue();
      };

      cursorReq.onerror = () => reject(cursorReq.error || new Error("Failed to read queued frames"));
    });

  const remove = (ids: number[]) =>
    new Promise<void>((resolve, reject) => {
      if (!ids.length) {
        resolve();
        return;
      }
      const tx = db.transaction(IDB_STORE_NAME, "readwrite");
      const store = tx.objectStore(IDB_STORE_NAME);
      for (const id of ids) {
        store.delete(id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Failed to remove queued frames"));
    });

  return {
    mode: "indexeddb",
    enqueue,
    peek,
    remove,
    count,
  };
};

const createQueueStore = async (): Promise<QueueStore> => {
  if (typeof window === "undefined" || !window.indexedDB) {
    return createMemoryQueueStore();
  }
  try {
    return await createIndexedDbQueueStore();
  } catch {
    return createMemoryQueueStore();
  }
};

const canvasToWebpBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to encode webp blob"));
          return;
        }
        resolve(blob);
      },
      "image/webp",
      quality
    );
  });

const resizeCanvasLongEdge = (source: HTMLCanvasElement, longEdge: number): HTMLCanvasElement => {
  const width = source.width;
  const height = source.height;
  const maxEdge = Math.max(width, height);

  if (!maxEdge || maxEdge <= longEdge) return source;

  const ratio = longEdge / maxEdge;
  const target = document.createElement("canvas");
  target.width = Math.max(1, Math.round(width * ratio));
  target.height = Math.max(1, Math.round(height * ratio));
  const ctx = target.getContext("2d");
  if (ctx) {
    ctx.drawImage(source, 0, 0, target.width, target.height);
  }
  return target;
};

const PLACEHOLDER_WIDTH = 640;
const PLACEHOLDER_HEIGHT = 360;

/** Generate a black frame with a timestamp so the video timeline stays continuous. */
const createPlaceholderFrame = async (): Promise<Blob> => {
  const canvas = document.createElement("canvas");
  canvas.width = PLACEHOLDER_WIDTH;
  canvas.height = PLACEHOLDER_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, PLACEHOLDER_WIDTH, PLACEHOLDER_HEIGHT);
    ctx.fillStyle = "#fff";
    ctx.font = "20px monospace";
    ctx.textAlign = "center";
    const ts = new Date().toISOString();
    ctx.fillText("SCREEN SHARE INTERRUPTED", PLACEHOLDER_WIDTH / 2, PLACEHOLDER_HEIGHT / 2 - 14);
    ctx.fillText(ts, PLACEHOLDER_WIDTH / 2, PLACEHOLDER_HEIGHT / 2 + 14);
  }
  return canvasToWebpBlob(canvas, 0.3);
};

const encodeUnderBudget = async (canvas: HTMLCanvasElement): Promise<Blob> => {
  const qualityChain = [0.4, 0.3, 0.2];
  let best = await canvasToWebpBlob(canvas, qualityChain[0]);
  if (best.size <= MAX_FRAME_BYTES) return best;

  for (const quality of qualityChain.slice(1)) {
    const blob = await canvasToWebpBlob(canvas, quality);
    best = blob;
    if (blob.size <= MAX_FRAME_BYTES) return blob;
  }

  const resized = resizeCanvasLongEdge(canvas, 960);
  if (resized !== canvas) {
    for (const quality of qualityChain) {
      const blob = await canvasToWebpBlob(resized, quality);
      best = blob;
      if (blob.size <= MAX_FRAME_BYTES) return blob;
    }
  }

  return best;
};

interface UseAnticheatScreenCaptureParams {
  contestId?: string;
  enabled: boolean;
}

export const useAnticheatScreenCapture = ({
  contestId,
  enabled,
}: UseAnticheatScreenCaptureParams) => {
  const queueRef = useRef<QueueStore | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const urlsRef = useRef<AnticheatUploadItem[]>([]);
  const uploadSessionIdRef = useRef<string | null>(null);
  const nextSeqRef = useRef<number>(1);
  const fetchingUrlsRef = useRef(false);
  const uploadBusyRef = useRef(false);
  const isStoppingRef = useRef(false);
  const intentionalStopUntilRef = useRef(0);
  const degradedReportedAtRef = useRef(0);

  const [uploadSessionId, setUploadSessionIdState] = useState<string | null>(null);

  const refreshPendingCount = useCallback(async (): Promise<number> => {
    const queue = queueRef.current;
    if (!queue) return 0;
    const count = await queue.count();
    return count;
  }, []);

  const reportDegraded = useCallback(
    async (reason: string) => {
      if (!contestId) return;
      const now = Date.now();
      if (now - degradedReportedAtRef.current < DEGRADE_REPORT_COOLDOWN_MS) return;
      degradedReportedAtRef.current = now;
      await recordExamEvent(contestId, "capture_upload_degraded", reason).catch(() => null);
    },
    [contestId]
  );

  const ensureQueue = useCallback(async (): Promise<QueueStore> => {
    if (queueRef.current) return queueRef.current;
    const queue = await createQueueStore();
    queueRef.current = queue;
    if (queue.mode === "memory") {
      await reportDegraded("IndexedDB unavailable, fallback to in-memory queue");
    }
    return queue;
  }, [reportDegraded]);

  const stopScreenStream = useCallback(() => {
    intentionalStopUntilRef.current = Date.now() + 2000;
    isStoppingRef.current = true;
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current = null;
    }
    isStoppingRef.current = false;
  }, []);

  const ensureScreenStream = useCallback(async (): Promise<boolean> => {
    if (!enabled || !contestId) return false;

    const current = streamRef.current;
    const liveTrack = current?.getVideoTracks?.()[0];
    if (liveTrack && liveTrack.readyState === "live") return true;

    const handoffStream = consumePrecheckScreenShareHandoff();
    const handoffTrack = handoffStream?.getVideoTracks?.()[0];
    if (handoffStream && handoffTrack && handoffTrack.readyState === "live") {
      streamRef.current = handoffStream;
      const video = document.createElement("video");
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.srcObject = handoffStream;
      try {
        await video.play();
      } catch {
        // Ignore autoplay errors; first capture tick may still render frame.
      }
      videoRef.current = video;

      handoffTrack.onended = () => {
        if (isStoppingRef.current) return;
        if (Date.now() < intentionalStopUntilRef.current) return;
        if (streamRef.current?.getVideoTracks?.()[0] !== handoffTrack) return;
        void recordExamEvent(contestId, "screen_share_stopped", "Screen share track ended").catch(() => null);
      };

      return true;
    }

    await reportDegraded("Missing reusable screen share stream from precheck; skip runtime re-prompt");
    return false;
  }, [contestId, enabled, reportDegraded]);

  const ensureUploadUrls = useCallback(
    async (needed = 1) => {
      if (!contestId) return;
      if (urlsRef.current.length >= needed || fetchingUrlsRef.current) return;
      fetchingUrlsRef.current = true;
      try {
        const response = await getAnticheatUrls(contestId, URL_BATCH_COUNT, {
          upload_session_id: uploadSessionIdRef.current || undefined,
          start_seq: nextSeqRef.current,
        });

        if (!uploadSessionIdRef.current) {
          uploadSessionIdRef.current = response.upload_session_id;
          setUploadSessionIdState(response.upload_session_id);
          setExamCaptureSessionId(contestId, response.upload_session_id);
        }

        if (Array.isArray(response.items) && response.items.length > 0) {
          urlsRef.current.push(...response.items);
        }

        if (typeof response.next_seq === "number" && response.next_seq > 0) {
          nextSeqRef.current = response.next_seq;
        } else if (response.items.length > 0) {
          nextSeqRef.current = response.items[response.items.length - 1].seq + 1;
        }
        setExamCaptureNextSeq(contestId, nextSeqRef.current);
      } catch {
        await reportDegraded("Failed to fetch anticheat presigned URLs");
      } finally {
        fetchingUrlsRef.current = false;
      }
    },
    [contestId]
  );

  const flushPendingUploads = useCallback(async () => {
    if (!enabled || !contestId) return;
    if (uploadBusyRef.current) return;

    const queue = await ensureQueue();
    uploadBusyRef.current = true;

    try {
      let loopGuard = 0;
      while (loopGuard < 20) {
        loopGuard += 1;

        const [frame] = await queue.peek(1);
        if (!frame) break;

        await ensureUploadUrls(1);
        const uploadItem = urlsRef.current.shift();
        if (!uploadItem) break;

        const headers = new Headers({ "Content-Type": "image/webp" });
        if (uploadItem.required_headers) {
          for (const [key, value] of Object.entries(uploadItem.required_headers)) {
            headers.set(key, value);
          }
        }

        try {
          const res = await fetch(uploadItem.put_url, {
            method: "PUT",
            headers,
            body: frame.blob,
          });
          if (!res.ok) {
            urlsRef.current.unshift(uploadItem);
            const host = (() => {
              try {
                return new URL(uploadItem.put_url).host;
              } catch {
                return "invalid-url";
              }
            })();
            await reportDegraded(`Upload failed (status=${res.status}, host=${host})`);
            break;
          }

          await queue.remove([frame.id]);
        } catch {
          urlsRef.current.unshift(uploadItem);
          const host = (() => {
            try {
              return new URL(uploadItem.put_url).host;
            } catch {
              return "invalid-url";
            }
          })();
          await reportDegraded(`Upload network error (host=${host})`);
          break;
        }
      }
    } finally {
      uploadBusyRef.current = false;
      await refreshPendingCount();
    }
  }, [contestId, enabled, ensureQueue, ensureUploadUrls, refreshPendingCount]);

  const captureAndQueue = useCallback(async () => {
    if (!enabled || !contestId) return;

    const queue = await ensureQueue();
    const streamAvailable = await ensureScreenStream();

    let blob: Blob;
    if (!streamAvailable || !videoRef.current) {
      // Stream dead — insert placeholder to keep timeline continuous
      blob = await createPlaceholderFrame();
    } else {
      const video = videoRef.current;
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) return;

      const canvas = canvasRef.current ?? document.createElement("canvas");
      canvasRef.current = canvas;
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, width, height);
      blob = await encodeUnderBudget(canvas);
    }

    await queue.enqueue(blob);
    await refreshPendingCount();

    const queueCount = await queue.count();
    if (queueCount >= Math.floor(MAX_IDB_QUEUE * 0.8)) {
      await reportDegraded(`Capture queue backlog high: ${queueCount}`);
    }

    await flushPendingUploads();
  }, [contestId, enabled, ensureQueue, ensureScreenStream, flushPendingUploads, refreshPendingCount, reportDegraded]);

  // Separate effect for stream lifecycle — only stop when truly disabled
  useEffect(() => {
    if (!enabled || !contestId) {
      stopScreenStream();
    }
  }, [enabled, contestId, stopScreenStream]);

  // Capture loop — does NOT touch the stream on cleanup (stream managed above)
  useEffect(() => {
    if (!enabled || !contestId) {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    uploadSessionIdRef.current = getExamCaptureSessionId(contestId);
    nextSeqRef.current = getExamCaptureNextSeq(contestId) || 1;
    if (uploadSessionIdRef.current) {
      setUploadSessionIdState(uploadSessionIdRef.current);
    }

    let cancelled = false;

    const nextJitteredDelay = () => {
      const jitter = 1 + (Math.random() * 2 - 1) * CAPTURE_JITTER_RATIO;
      return Math.round(CAPTURE_BASE_INTERVAL_MS * jitter);
    };

    const scheduleNext = () => {
      if (cancelled) return;
      timerRef.current = window.setTimeout(() => {
        void captureAndQueue().finally(() => scheduleNext());
      }, nextJitteredDelay());
    };

    const boot = async () => {
      await ensureQueue();
      await refreshPendingCount();
      if (cancelled) return;
      void captureAndQueue();
      scheduleNext();
    };

    void boot();

    return () => {
      cancelled = true;
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [captureAndQueue, contestId, enabled, ensureQueue, refreshPendingCount]);

  return {
    uploadSessionId,
    flushPendingUploads,
  };
};

export default useAnticheatScreenCapture;
