import { useCallback, useEffect, useRef, useState } from "react";
import {
  getAnticheatUrls,
  type AnticheatUrlsRequestError,
  type AnticheatUploadItem,
} from "@/infrastructure/api/repositories/exam.repository";
import {
  clearExamCaptureSessionId,
  getExamCaptureNextSeq,
  getExamCaptureSessionId,
  setExamCaptureNextSeq,
  setExamCaptureSessionId,
} from "./examCaptureSession";
import {
  clearRuntimeScreenShareHandoff,
  consumeRuntimeScreenShareHandoff,
  consumePrecheckScreenShareHandoff,
  setRuntimeScreenShareHandoff,
} from "./examScreenShareHandoff";
import { hasExamPrecheckPassed } from "./useExamPrecheckGate";
import {
  buildAnticheatMetadata,
  decideAnticheatSignal,
  getAnticheatPhase,
} from "@/features/contest/anticheat/orchestrator";
import {
  recordExamEventWithForcedCapture,
  registerForcedCaptureHandler,
  unregisterForcedCaptureHandler,
  type ForcedCaptureOptions,
  type ForcedCaptureResult,
} from "@/features/contest/anticheat/forcedCapture";
import { createStreamAdapter } from "@/features/contest/anticheat/streamAdapter";
import {
  beginRuntimeScreenShareReauth,
  endRuntimeScreenShareReauth,
} from "@/features/contest/anticheat/runtimeReauthState";

const DEFAULT_CAPTURE_INTERVAL_MS = 3_000; // fallback，與後端預設一致
const CAPTURE_JITTER_RATIO = 0.15; // ±15%
const MAX_FRAME_BYTES = 80 * 1024;
const MAX_IDB_QUEUE = 600;
const MAX_MEMORY_QUEUE = 120;
const URL_BATCH_COUNT = 120;
const DEGRADE_REPORT_COOLDOWN_MS = 60_000;
const URL_FETCH_BASE_BACKOFF_MS = 2_000;
const URL_FETCH_MAX_BACKOFF_MS = 30_000;
const FORCED_CAPTURE_COOLDOWN_MS = 1_000;

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
  enqueue: (blob: Blob) => Promise<number>;
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
      const id = nextId++;
      queue.push({ id, createdAt: Date.now(), blob });
      return id;
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

    return new Promise<number>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, "readwrite");
      const request = tx.objectStore(IDB_STORE_NAME).add({ createdAt: Date.now(), blob });
      tx.oncomplete = () => resolve(Number(request.result));
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

const encodeUnderBudget = async (canvas: HTMLCanvasElement): Promise<Blob> => {
  const qualityChain = [0.7, 0.5, 0.4];
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
  const enabledRef = useRef(enabled);
  const screenShareStoppedReportedRef = useRef(false);
  const streamAuthFailedRef = useRef(false);
  const streamAdapterRef = useRef(createStreamAdapter());
  const runtimeReauthPromiseRef = useRef<Promise<MediaStream | null> | null>(null);
  const captureIntervalMsRef = useRef(DEFAULT_CAPTURE_INTERVAL_MS);
  const urlFetchFailureCountRef = useRef(0);
  const nextUrlFetchAllowedAtRef = useRef(0);
  const lastForcedCaptureAtRef = useRef(0);

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
      const decision = decideAnticheatSignal(contestId, {
        eventType: "capture_upload_degraded",
        reason,
        source: "upload_manager",
        severity: "info",
      });
      if (!decision.accepted) return;
      await recordExamEventWithForcedCapture(contestId, "capture_upload_degraded", {
        reason,
        source: "upload_manager",
        phase: decision.phase,
        eventIdempotencyKey: decision.eventIdempotencyKey,
        forceCaptureReason: `capture_upload_degraded:${reason}`,
        captureOptions: { allowStreamRecovery: false },
        metadata: buildAnticheatMetadata(decision, {
          source: "upload_manager",
          severity: "info",
          upload_session_id: uploadSessionIdRef.current || undefined,
        }),
      }).catch(() => null);
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

  const resetUploadSession = useCallback(() => {
    if (!contestId) return;
    uploadSessionIdRef.current = null;
    setUploadSessionIdState(null);
    urlsRef.current = [];
    nextSeqRef.current = 1;
    clearExamCaptureSessionId(contestId);
  }, [contestId]);

  const scheduleNextUrlFetchAttempt = useCallback(
    (retryAfterMs?: number) => {
      const now = Date.now();
      const failureCount = urlFetchFailureCountRef.current;
      const exponentialDelay = Math.min(
        URL_FETCH_MAX_BACKOFF_MS,
        URL_FETCH_BASE_BACKOFF_MS * Math.max(1, 2 ** Math.max(0, failureCount - 1))
      );
      const delay = Math.max(retryAfterMs ?? 0, exponentialDelay);
      nextUrlFetchAllowedAtRef.current = now + delay;
      return delay;
    },
    []
  );

  const stopScreenStream = useCallback(() => {
    intentionalStopUntilRef.current = Date.now() + 2000;
    isStoppingRef.current = true;
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      streamAdapterRef.current.stopStream(stream);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current = null;
    }
    streamAuthFailedRef.current = false;
    screenShareStoppedReportedRef.current = false;
    isStoppingRef.current = false;
  }, []);

  const forceStopCapture = useCallback(() => {
    enabledRef.current = false;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    clearRuntimeScreenShareHandoff(true);
    stopScreenStream();
  }, [stopScreenStream]);

  const shouldPreserveAcrossRouteTransition = useCallback(() => {
    if (!contestId) return false;
    const phase = getAnticheatPhase(contestId);
    if (phase === "TERMINATING" || phase === "TERMINAL") return false;
    return hasExamPrecheckPassed(contestId);
  }, [contestId]);

  const releaseScreenStreamForRouteTransition = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    if (!stream) return;

    const track = stream.getVideoTracks?.()[0];
    if (track) {
      track.onended = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current = null;
    }

    if (streamAdapterRef.current.isLive(stream)) {
      setRuntimeScreenShareHandoff(stream);
    } else {
      streamAdapterRef.current.stopStream(stream);
    }

    streamAuthFailedRef.current = false;
    screenShareStoppedReportedRef.current = false;
  }, []);

  const reportScreenShareStopped = useCallback(
    async (reason: string) => {
      if (!contestId) return;
      if (screenShareStoppedReportedRef.current) return;
      screenShareStoppedReportedRef.current = true;
      streamAuthFailedRef.current = true;
      const decision = decideAnticheatSignal(contestId, {
        eventType: "screen_share_stopped",
        reason,
        source: "stream_adapter",
        severity: "violation",
      });
      if (!decision.accepted && getAnticheatPhase(contestId) !== "TERMINATING" && getAnticheatPhase(contestId) !== "TERMINAL") {
        return;
      }
      await recordExamEventWithForcedCapture(contestId, "screen_share_stopped", {
        reason,
        source: "stream_adapter",
        phase: decision.phase,
        eventIdempotencyKey: decision.eventIdempotencyKey,
        forceCaptureReason: `screen_share_stopped:${reason}`,
        captureOptions: { allowStreamRecovery: false },
        metadata: buildAnticheatMetadata(decision, {
          source: "stream_adapter",
          severity: "violation",
          upload_session_id: uploadSessionIdRef.current || undefined,
        }),
      }).catch(() => null);
    },
    [contestId]
  );

  const attachStream = useCallback(
    async (stream: MediaStream): Promise<boolean> => {
      const track = stream.getVideoTracks?.()[0];
      if (!track || track.readyState !== "live") return false;

      streamRef.current = stream;
      const video = document.createElement("video");
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // Ignore autoplay errors; first capture tick may still render frame.
      }
      videoRef.current = video;
      streamAuthFailedRef.current = false;
      screenShareStoppedReportedRef.current = false;

      track.onended = () => {
        if (isStoppingRef.current) return;
        if (Date.now() < intentionalStopUntilRef.current) return;
        if (streamRef.current?.getVideoTracks?.()[0] !== track) return;
        streamRef.current = null;
        if (videoRef.current) {
          videoRef.current.srcObject = null;
          videoRef.current = null;
        }
        void reportScreenShareStopped("Screen share track ended");
      };

      return true;
    },
    [reportScreenShareStopped]
  );

  const requestRuntimeMonitorStream = useCallback(async (
    options?: { reportFailure?: boolean }
  ): Promise<MediaStream | null> => {
    const reportFailure = options?.reportFailure ?? true;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      await reportDegraded("Browser does not support runtime getDisplayMedia");
      if (reportFailure) {
        await reportScreenShareStopped("Browser does not support runtime screen-share");
      }
      return null;
    }

    if (runtimeReauthPromiseRef.current) {
      return runtimeReauthPromiseRef.current;
    }

    const pending = (async () => {
      beginRuntimeScreenShareReauth();
      try {
        const stream = await streamAdapterRef.current.acquireMonitorStream();
        if (!stream) {
          if (reportFailure) {
            await reportScreenShareStopped(
              "Runtime screen-share re-authorization denied or non-monitor source"
            );
          }
          return null;
        }
        return stream;
      } finally {
        endRuntimeScreenShareReauth();
        runtimeReauthPromiseRef.current = null;
      }
    })();

    runtimeReauthPromiseRef.current = pending;
    return pending;
  }, [reportDegraded, reportScreenShareStopped]);

  const ensureScreenStream = useCallback(async (
    options?: { allowRuntimeRecovery?: boolean; reportFailure?: boolean }
  ): Promise<boolean> => {
    if (!enabled || !contestId) return false;
    if (streamAuthFailedRef.current) return false;
    const allowRuntimeRecovery = options?.allowRuntimeRecovery ?? true;
    const reportFailure = options?.reportFailure ?? true;

    const current = streamRef.current;
    if (streamAdapterRef.current.isLive(current)) return true;

    const runtimeHandoff = consumeRuntimeScreenShareHandoff();
    if (runtimeHandoff) {
      const attached = await attachStream(runtimeHandoff);
      if (attached) return true;
      if (reportFailure) {
        await reportScreenShareStopped("Preserved screen-share stream is no longer live");
      }
    }

    const handoffStream = consumePrecheckScreenShareHandoff();
    if (handoffStream) {
      const attached = await attachStream(handoffStream);
      if (attached) return true;
    }

    if (!allowRuntimeRecovery) return false;

    const runtimeStream = await requestRuntimeMonitorStream({ reportFailure });
    if (!runtimeStream) return false;
    return attachStream(runtimeStream);
  }, [attachStream, contestId, enabled, reportScreenShareStopped, requestRuntimeMonitorStream]);

  const ensureUploadUrls = useCallback(
    async (needed = 1) => {
      if (!contestId) return;
      if (urlsRef.current.length >= needed || fetchingUrlsRef.current) return;
      if (Date.now() < nextUrlFetchAllowedAtRef.current) return;
      fetchingUrlsRef.current = true;
      try {
        const response = await getAnticheatUrls(contestId, URL_BATCH_COUNT, {
          upload_session_id: uploadSessionIdRef.current || undefined,
          start_seq: nextSeqRef.current,
        });
        urlFetchFailureCountRef.current = 0;
        nextUrlFetchAllowedAtRef.current = 0;

        if (!uploadSessionIdRef.current) {
          uploadSessionIdRef.current = response.upload_session_id;
          setUploadSessionIdState(response.upload_session_id);
          setExamCaptureSessionId(contestId, response.upload_session_id);
        }

        if (typeof response.interval_seconds === "number" && response.interval_seconds > 0) {
          captureIntervalMsRef.current = response.interval_seconds * 1000;
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
      } catch (error) {
        const err = error as AnticheatUrlsRequestError;
        const status = typeof err?.status === "number" ? err.status : undefined;
        const retryAfterMs =
          typeof err?.retryAfterMs === "number" && err.retryAfterMs > 0
            ? err.retryAfterMs
            : undefined;
        const isRetryable = !status || status === 429 || status >= 500;
        if (isRetryable) {
          urlFetchFailureCountRef.current += 1;
          const delayMs = scheduleNextUrlFetchAttempt(retryAfterMs);
          const statusLabel = status ? String(status) : "network";
          await reportDegraded(
            `Failed to fetch anticheat presigned URLs (status=${statusLabel}, backoff_ms=${delayMs})`
          );
        } else {
          urlFetchFailureCountRef.current = 0;
          nextUrlFetchAllowedAtRef.current = Date.now() + URL_FETCH_BASE_BACKOFF_MS;
          resetUploadSession();
          await reportDegraded(
            `Rejected anticheat upload session (status=${status}); reset upload session`
          );
        }
      } finally {
        fetchingUrlsRef.current = false;
      }
    },
    [contestId, reportDegraded, resetUploadSession, scheduleNextUrlFetchAttempt]
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
            const host = (() => {
              try {
                return new URL(uploadItem.put_url).host;
              } catch {
                return "invalid-url";
              }
            })();
            await reportDegraded(`Upload failed (status=${res.status}, host=${host})`);
            if (res.status >= 400 && res.status < 500) {
              if (res.status === 429) {
                urlsRef.current.unshift(uploadItem);
                break;
              }
              // Non-retriable presigned URL failures must not poison the queue head.
              resetUploadSession();
              continue;
            }
            urlsRef.current.unshift(uploadItem);
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
  }, [contestId, enabled, ensureQueue, ensureUploadUrls, refreshPendingCount, reportDegraded, resetUploadSession]);

  const uploadBlobNow = useCallback(async (
    blob: Blob
  ): Promise<{ uploaded: boolean; seq: number | null; errorCode?: string }> => {
    await ensureUploadUrls(1);
    const uploadItem = urlsRef.current.shift();
    if (!uploadItem) {
      return { uploaded: false, seq: null, errorCode: "upload_url_unavailable" };
    }

    const headers = new Headers({ "Content-Type": "image/webp" });
    if (uploadItem.required_headers) {
      for (const [key, value] of Object.entries(uploadItem.required_headers)) {
        headers.set(key, value);
      }
    }

    try {
      const response = await fetch(uploadItem.put_url, {
        method: "PUT",
        headers,
        body: blob,
      });

      if (!response.ok) {
        if (response.status === 429 || response.status >= 500) {
          urlsRef.current.unshift(uploadItem);
        } else {
          resetUploadSession();
        }
        return {
          uploaded: false,
          seq: uploadItem.seq,
          errorCode: `upload_http_${response.status}`,
        };
      }

      return { uploaded: true, seq: uploadItem.seq };
    } catch {
      urlsRef.current.unshift(uploadItem);
      return {
        uploaded: false,
        seq: uploadItem.seq,
        errorCode: "upload_network_error",
      };
    }
  }, [ensureUploadUrls, resetUploadSession]);

  const captureFrameBlob = useCallback(async (
    options?: { allowStreamRecovery?: boolean }
  ): Promise<Blob | null> => {
    if (!enabledRef.current || !contestId) return null;

    const streamAlive = streamAdapterRef.current.isLive(streamRef.current);
    if (!streamAlive) {
      const acquired = await ensureScreenStream({
        allowRuntimeRecovery: options?.allowStreamRecovery ?? true,
        reportFailure: false,
      });
      if (!acquired || !videoRef.current) {
        return null;
      }
    }

    const video = videoRef.current;
    if (!video) return null;

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return null;

    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvasRef.current = canvas;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, width, height);
    return encodeUnderBudget(canvas);
  }, [contestId, ensureScreenStream]);

  const captureAndQueue = useCallback(async () => {
    if (!enabledRef.current || !contestId) return;

    const queue = await ensureQueue();
    const blob = await captureFrameBlob({ allowStreamRecovery: true });
    if (!blob) return;

    await queue.enqueue(blob);
    await refreshPendingCount();

    const queueCount = await queue.count();
    if (queueCount >= Math.floor(MAX_IDB_QUEUE * 0.8)) {
      await reportDegraded(`Capture queue backlog high: ${queueCount}`);
    }

    await flushPendingUploads();
  }, [captureFrameBlob, contestId, ensureQueue, flushPendingUploads, refreshPendingCount, reportDegraded]);

  const forceCaptureNow = useCallback(async (
    _reason: string,
    options?: ForcedCaptureOptions
  ): Promise<ForcedCaptureResult> => {
    const currentUploadSessionId =
      uploadSessionIdRef.current || (contestId ? getExamCaptureSessionId(contestId) : null);

    if (!contestId || !enabledRef.current) {
      return {
        attempted: false,
        captured: false,
        uploaded: false,
        skipped: "disabled",
        errorCode: "capture_disabled",
        uploadSessionId: currentUploadSessionId,
        seq: null,
      };
    }

    const now = Date.now();
    if (now - lastForcedCaptureAtRef.current < FORCED_CAPTURE_COOLDOWN_MS) {
      return {
        attempted: false,
        captured: false,
        uploaded: false,
        skipped: "cooldown",
        errorCode: "capture_cooldown",
        uploadSessionId: currentUploadSessionId,
        seq: null,
      };
    }
    lastForcedCaptureAtRef.current = now;

    const blob = await captureFrameBlob({
      allowStreamRecovery: options?.allowStreamRecovery ?? true,
    });
    if (!blob) {
      return {
        attempted: true,
        captured: false,
        uploaded: false,
        skipped: "stream_unavailable",
        errorCode: "stream_unavailable",
        uploadSessionId:
          uploadSessionIdRef.current || (contestId ? getExamCaptureSessionId(contestId) : null),
        seq: null,
      };
    }

    const queue = await ensureQueue();
    const frameId = await queue.enqueue(blob);
    await refreshPendingCount();

    const uploadResult = await uploadBlobNow(blob);
    if (uploadResult.uploaded) {
      await queue.remove([frameId]);
      await refreshPendingCount();
    } else {
      void flushPendingUploads();
    }

    return {
      attempted: true,
      captured: true,
      uploaded: uploadResult.uploaded,
      errorCode: uploadResult.errorCode,
      uploadSessionId:
        uploadSessionIdRef.current || (contestId ? getExamCaptureSessionId(contestId) : null),
      seq: uploadResult.seq,
    };
  }, [captureFrameBlob, contestId, ensureQueue, flushPendingUploads, refreshPendingCount, uploadBlobNow]);

  // Keep enabledRef in sync for the unmount-only cleanup below
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    if (!contestId) return;
    registerForcedCaptureHandler(contestId, forceCaptureNow);
    return () => {
      unregisterForcedCaptureHandler(contestId, forceCaptureNow);
    };
  }, [contestId, forceCaptureNow]);

  // Stream lifecycle — stop stream when disabled
  useEffect(() => {
    if (!enabled || !contestId) {
      if (contestId && shouldPreserveAcrossRouteTransition()) {
        return;
      }
      clearRuntimeScreenShareHandoff(true);
      stopScreenStream();
    }
  }, [enabled, contestId, shouldPreserveAcrossRouteTransition, stopScreenStream]);

  // Unmount-only: always stop stream when component is destroyed
  useEffect(() => {
    return () => {
      if (contestId && (enabledRef.current || shouldPreserveAcrossRouteTransition())) {
        releaseScreenStreamForRouteTransition();
      } else {
        clearRuntimeScreenShareHandoff(true);
        stopScreenStream();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      return Math.round(captureIntervalMsRef.current * jitter);
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
    forceStopCapture,
    forceCaptureNow,
  };
};

export default useAnticheatScreenCapture;
