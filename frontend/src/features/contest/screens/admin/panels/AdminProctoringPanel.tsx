import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, Modal, TableToolbarSearch, Tag, TextArea, TextInput } from "@carbon/react";
import {
  ArrowLeft,
  CheckmarkFilled,
  DataCollection,
  InProgress,
  Locked,
  PauseFilled,
  Renew,
  RightPanelClose,
  RightPanelOpen,
  Unlocked,
  UserMultiple,
  WarningFilled,
} from "@carbon/icons-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import type { ContestDetail, ContestParticipant, EventFeedItem, ParticipantDashboard } from "@/core/entities/contest.entity";
import type { AdminPanelProps } from "@/features/contest/modules/types";
import { createSfuLiveSubscriber } from "@/features/contest/anticheat/sfuLiveSubscriber";
import { PRIORITY_LABELS, PRIORITY_TAG_COLOR } from "@/features/contest/constants/eventTaxonomy";
import { useAdminPanelRefresh, useContestAdmin } from "@/features/contest/contexts";
import {
  createManualProctorEvent,
  getManualProctorEvidenceUrls,
  getParticipantDashboard,
  uploadAnticheatBatch,
  unlockParticipant,
  updateParticipant,
} from "@/infrastructure/api/repositories";
import {
  fetchScreenshots,
  getRealtimeSfuPublisher,
  type ScreenshotFrame,
  type RealtimeSfuPublisherDto,
  type RealtimeSfuSourceModule,
} from "@/infrastructure/api/repositories/exam.repository";
import { useMediaQuery } from "@/shared/hooks";
import { useToast } from "@/shared/contexts/ToastContext";
import { PanelToolbar } from "@/shared/ui/list/PanelToolbar";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";

import styles from "./AdminProctoringPanel.module.scss";

type LiveSource = RealtimeSfuSourceModule;

interface SourceViewState {
  busy: boolean;
  isStreaming: boolean;
  errorMessage: string;
}

const SOURCE_ORDER: LiveSource[] = ["screen_share", "webcam"];
const EMPTY_EVENT_FEED: EventFeedItem[] = [];
const AUTO_REFRESH_MS = 30000;
const LIVE_STATUS_REFRESH_MS = 10000;
const MANUAL_EVIDENCE_CAPTURE_INTERVAL_MS = 5000;
const MANUAL_PROCTOR_EVENT_TYPE = "manual_proctor_note";
const PANEL_TRANSITION = {
  duration: 0.22,
  ease: [0.2, 0, 0.38, 0.9] as const,
};

const createInitialSourceState = (): Record<LiveSource, SourceViewState> => ({
  screen_share: { busy: false, isStreaming: false, errorMessage: "" },
  webcam: { busy: false, isStreaming: false, errorMessage: "" },
});

const inferSourceModule = (publisher: RealtimeSfuPublisherDto): LiveSource => {
  if (publisher.source_module === "webcam" || publisher.source_module === "screen_share") {
    return publisher.source_module;
  }
  return publisher.track_name.startsWith("webcam-") ? "webcam" : "screen_share";
};

const getParticipantDisplayName = (participant: ContestParticipant) =>
  participant.userDisplayName ||
  participant.displayName ||
  participant.nickname ||
  participant.username;

const isParticipantLive = (participant: ContestParticipant) =>
  participant.liveMonitoringOnline || participant.connectionStatus === "live";

type AttentionLevel = "none" | "low" | "medium" | "high";

const getAttentionLevel = (participant: ContestParticipant): AttentionLevel => {
  if (participant.examStatus === "locked" || participant.violationCount >= 5) {
    return "high";
  }
  if (participant.examStatus === "paused" || participant.violationCount >= 3) {
    return "medium";
  }
  if (participant.violationCount > 0 || (participant.examStatus === "in_progress" && !isParticipantLive(participant))) {
    return "low";
  }
  return "none";
};

const getAttentionScore = (participant: ContestParticipant) => {
  let score = 0;
  if (participant.examStatus === "locked") score += 1000;
  if (participant.examStatus === "paused") score += 700;
  score += participant.violationCount * 80;
  if (participant.examStatus === "in_progress" && !isParticipantLive(participant)) score += 120;
  if (isParticipantLive(participant)) score += 20;
  return score;
};

const isContestInExamWindow = (contest: ContestDetail | null | undefined, now: number) => {
  const start = Date.parse(contest?.startTime ?? "");
  const end = Date.parse(contest?.endTime ?? "");
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  return now >= start && now <= end;
};

const getParticipantSearchText = (participant: ContestParticipant) =>
  [
    participant.username,
    participant.userDisplayName,
    participant.displayName,
    participant.nickname,
    participant.email,
    participant.examStatus,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const getModuleResults = (metadata: Record<string, unknown>) => {
  const raw = metadata.forced_capture_module_results;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Partial<Record<LiveSource, Record<string, unknown>>>;
};

const getEvidenceObjectKeys = (metadata: Record<string, unknown>): string[] => {
  const keys = new Set<string>();
  const topLevelKeys = Array.isArray(metadata.forced_capture_uploaded_object_keys)
    ? metadata.forced_capture_uploaded_object_keys
    : [];
  topLevelKeys.forEach((value) => {
    if (typeof value === "string") keys.add(value);
  });
  Object.values(getModuleResults(metadata)).forEach((result) => {
    const moduleKeys = Array.isArray(result?.uploadedObjectKeys)
      ? result.uploadedObjectKeys
      : [];
    moduleKeys.forEach((value) => {
      if (typeof value === "string") keys.add(value);
    });
  });
  return Array.from(keys);
};

const getEvidenceModules = (metadata: Record<string, unknown>, objectKeys: string[]): LiveSource[] => {
  const modules = new Set<LiveSource>();
  const configuredModules = Array.isArray(metadata.forced_capture_modules)
    ? metadata.forced_capture_modules
    : [];
  configuredModules.forEach((value) => {
    if (value === "screen_share" || value === "webcam") modules.add(value);
  });
  Object.keys(getModuleResults(metadata)).forEach((value) => {
    if (value === "screen_share" || value === "webcam") modules.add(value);
  });
  objectKeys.forEach((key) => {
    if (key.includes("/screen_share/")) modules.add("screen_share");
    if (key.includes("/webcam/")) modules.add("webcam");
  });
  if (metadata.module === "screen_share" || metadata.module === "webcam") modules.add(metadata.module);
  if (metadata.evidence_source_module === "screen_share" || metadata.evidence_source_module === "webcam") {
    modules.add(metadata.evidence_source_module);
  }
  return Array.from(modules);
};

const formatEventTime = (value: string | number) => {
  const time = typeof value === "number" ? new Date(value) : new Date(value);
  return Number.isNaN(time.getTime()) ? "" : time.toLocaleTimeString();
};

const getEventLabel = (t: TFunction<"contest">, eventType: string) =>
  eventType === MANUAL_PROCTOR_EVENT_TYPE
    ? t("proctoringPanel.manualEvidenceEvent", "助教手動採證")
    : t(`logs.eventTypes.${eventType}`, eventType);

const getClipboardContentItems = (metadata?: Record<string, unknown>) => {
  const meta = metadata || {};
  const rawItems = Array.isArray(meta.clipboard_actions)
    ? meta.clipboard_actions
    : typeof meta.content === "string" || typeof meta.action === "string"
      ? [meta]
      : [];

  return rawItems
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item))
    .map((item, index) => ({
      id: `${String(item.action || "clipboard")}-${index}`,
      action: typeof item.action === "string" ? item.action : "clipboard",
      content: typeof item.content === "string" ? item.content : "",
      textLength: typeof item.text_length === "number" ? item.text_length : null,
      lineCount: typeof item.line_count === "number" ? item.line_count : null,
      truncated: item.content_truncated === true,
      originalLength: typeof item.original_text_length === "number" ? item.original_text_length : null,
      capturedLength: typeof item.captured_text_length === "number" ? item.captured_text_length : null,
    }));
};

interface ManualEvidenceFrame {
  id: number;
  createdAt: number;
  source: LiveSource;
  blob: Blob;
}

interface ManualEvidenceCaptureHandle {
  collectManualEvidenceFrames: () => Promise<ManualEvidenceFrame[]>;
}

interface UploadedManualEvidence {
  uploadSessionId: string;
  uploadedObjectKeys: string[];
  uploadedSeqs: number[];
  moduleResults: Partial<Record<LiveSource, Record<string, unknown>>>;
}

const captureVideoFrame = async (
  video: HTMLVideoElement | null,
  source: LiveSource,
): Promise<ManualEvidenceFrame | null> => {
  if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth <= 0 || video.videoHeight <= 0) {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/webp", 0.82);
  });
  if (!blob) return null;
  const createdAt = Date.now();
  return {
    id: createdAt,
    createdAt,
    source,
    blob,
  };
};

interface MinimalLiveStageProps {
  contestId: string;
  participant: ContestParticipant | null;
  discoveryRefreshKey: number;
  lockActionBusy: boolean;
  manualEvidenceActive: boolean;
  onToggleManualEvidence?: () => void;
  onToggleLock?: () => void;
  onBackToRoster?: () => void;
}

const MinimalLiveStage = forwardRef<ManualEvidenceCaptureHandle, MinimalLiveStageProps>(function MinimalLiveStage({
  contestId,
  participant,
  discoveryRefreshKey,
  lockActionBusy,
  manualEvidenceActive,
  onToggleManualEvidence,
  onToggleLock,
  onBackToRoster,
}, ref) {
  const { t } = useTranslation("contest");
  const videoRefs = useRef<Record<LiveSource, HTMLVideoElement | null>>({
    screen_share: null,
    webcam: null,
  });
  const subscriberRefs = useRef({
    screen_share: createSfuLiveSubscriber(),
    webcam: createSfuLiveSubscriber(),
  });
  const connectingSourcesRef = useRef<Set<LiveSource>>(new Set());
  const targetKeyRef = useRef("");
  const handledDiscoveryRefreshKeyRef = useRef(discoveryRefreshKey);
  const [sourceStates, setSourceStates] = useState(createInitialSourceState);
  const [publishers, setPublishers] = useState<RealtimeSfuPublisherDto[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [panelError, setPanelError] = useState("");
  const manualEvidenceFramesRef = useRef<ManualEvidenceFrame[]>([]);

  const userId = participant?.userId;
  const participantName = participant ? getParticipantDisplayName(participant) : "";
  const participantLocked = participant?.examStatus === "locked";

  const sourceLabels: Record<LiveSource, string> = useMemo(
    () => ({
      screen_share: t("proctoringPanel.sourceScreen", "Screen"),
      webcam: t("proctoringPanel.sourceWebcam", "Webcam"),
    }),
    [t],
  );

  const stopSource = useCallback((source: LiveSource) => {
    connectingSourcesRef.current.delete(source);
    subscriberRefs.current[source].stop();
    if (videoRefs.current[source]) {
      videoRefs.current[source]!.srcObject = null;
    }
    setSourceStates((current) => ({
      ...current,
      [source]: { busy: false, isStreaming: false, errorMessage: "" },
    }));
  }, []);

  const stopAll = useCallback(() => {
    SOURCE_ORDER.forEach((source) => stopSource(source));
  }, [stopSource]);

  const normalizePublishers = useCallback((items: RealtimeSfuPublisherDto[]) => {
    const bySource = new Map<LiveSource, RealtimeSfuPublisherDto>();
    items.forEach((publisher) => bySource.set(inferSourceModule(publisher), publisher));
    return SOURCE_ORDER.flatMap((source) => {
      const publisher = bySource.get(source);
      return publisher ? [publisher] : [];
    });
  }, []);

  const refreshSessions = useCallback(async () => {
    if (!contestId || !userId) {
      setPublishers([]);
      return;
    }
    setDiscovering(true);
    setPanelError("");
    try {
      const result = await getRealtimeSfuPublisher(contestId, userId);
      const normalizedPublishers = normalizePublishers(result.publishers ?? (result.publisher ? [result.publisher] : []));
      setPublishers(normalizedPublishers);
      setSourceStates((current) => {
        const next = { ...current };
        normalizedPublishers.forEach((publisher) => {
          const source = inferSourceModule(publisher);
          if (next[source].errorMessage && !next[source].isStreaming) {
            next[source] = { ...next[source], errorMessage: "" };
          }
        });
        return next;
      });
    } catch (error) {
      setPublishers([]);
      setPanelError(error instanceof Error ? error.message : t("liveView.discoveryError", "無法取得目前可監看的 session"));
    } finally {
      setDiscovering(false);
    }
  }, [contestId, normalizePublishers, t, userId]);

  useEffect(() => {
    const nextTargetKey = `${contestId}:${userId ?? ""}`;
    if (targetKeyRef.current !== nextTargetKey) {
      stopAll();
      setPublishers([]);
      setPanelError("");
      targetKeyRef.current = nextTargetKey;
    }
    void refreshSessions();
  }, [contestId, refreshSessions, stopAll, userId]);

  useEffect(() => () => stopAll(), [stopAll]);

  useEffect(() => {
    if (handledDiscoveryRefreshKeyRef.current === discoveryRefreshKey) return;
    handledDiscoveryRefreshKeyRef.current = discoveryRefreshKey;
    if (!participant) return;
    void refreshSessions();
  }, [discoveryRefreshKey, participant, refreshSessions]);

  const availableSources = useMemo(
    () => publishers.map((publisher) => inferSourceModule(publisher)),
    [publishers],
  );
  const startSource = useCallback(async (source: LiveSource) => {
    if (!contestId || !userId || connectingSourcesRef.current.has(source)) return;
    const publisher = publishers.find((item) => inferSourceModule(item) === source);
    if (!publisher) return;
    connectingSourcesRef.current.add(source);
    setSourceStates((current) => ({
      ...current,
      [source]: { ...current[source], busy: true, errorMessage: "" },
    }));
    try {
      await subscriberRefs.current[source].subscribeToPublisher(
        contestId,
        userId,
        publisher,
        (stream) => {
          const video = videoRefs.current[source];
          if (video) video.srcObject = stream;
        },
      );
      setSourceStates((current) => ({
        ...current,
        [source]: { busy: false, isStreaming: true, errorMessage: "" },
      }));
    } catch (error) {
      if (videoRefs.current[source]) videoRefs.current[source]!.srcObject = null;
      setSourceStates((current) => ({
        ...current,
        [source]: {
          busy: false,
          isStreaming: false,
          errorMessage: error instanceof Error ? error.message : t("liveView.unknownError", "啟動 live view 失敗"),
        },
      }));
    } finally {
      connectingSourcesRef.current.delete(source);
    }
  }, [contestId, publishers, t, userId]);

  useEffect(() => {
    if (!participant || discovering) return;
    availableSources.forEach((source) => {
      const sourceState = sourceStates[source];
      if (sourceState.busy || sourceState.isStreaming || sourceState.errorMessage) return;
      void startSource(source);
    });
  }, [availableSources, discovering, participant, sourceStates, startSource]);

  const connectedCount = SOURCE_ORDER.filter((source) => sourceStates[source].isStreaming).length;
  const visibleSources = availableSources;

  const captureConnectedFrames = useCallback(async () => {
    const frames = await Promise.all(
      SOURCE_ORDER.map(async (source) => {
        if (!sourceStates[source].isStreaming) return null;
        return captureVideoFrame(videoRefs.current[source], source);
      }),
    );
    return frames.filter((frame): frame is ManualEvidenceFrame => !!frame);
  }, [sourceStates]);

  useEffect(() => {
    if (!manualEvidenceActive) {
      manualEvidenceFramesRef.current = [];
      return;
    }
    let cancelled = false;
    const capture = async () => {
      const frames = await captureConnectedFrames();
      if (cancelled || frames.length === 0) return;
      manualEvidenceFramesRef.current = [
        ...manualEvidenceFramesRef.current,
        ...frames,
      ].slice(-24);
    };
    void capture();
    const intervalId = window.setInterval(() => {
      void capture();
    }, MANUAL_EVIDENCE_CAPTURE_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [captureConnectedFrames, manualEvidenceActive]);

  useImperativeHandle(ref, () => ({
    collectManualEvidenceFrames: async () => {
      const latestFrames = await captureConnectedFrames();
      const frames = [
        ...manualEvidenceFramesRef.current,
        ...latestFrames,
      ];
      const seen = new Set<string>();
      return frames.filter((frame) => {
        const key = `${frame.source}:${frame.createdAt}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
  }), [captureConnectedFrames]);

  const renderSource = (source: LiveSource) => {
    const sourceState = sourceStates[source];
    const connected = sourceState.isStreaming;

    return (
      <div
        key={source}
        className={`${styles.videoPane} ${source === "screen_share" ? styles.screenPane : styles.webcamPane}`}
      >
        <div className={styles.videoMeta}>
          <span>{sourceLabels[source]}</span>
          <span className={connected ? styles.signalLive : styles.signalMuted}>
            {sourceState.busy
              ? t("action.loading", "連線中...")
              : connected
                ? t("liveView.connected", "已連線")
                : t("action.loading", "連線中...")}
          </span>
        </div>
        <video
          ref={(node) => {
            videoRefs.current[source] = node;
          }}
          className={styles.video}
          autoPlay
          playsInline
          muted
        />
        {!connected ? (
          <div className={styles.blankVideo}>
            <span>{t("action.loading", "連線中...")}</span>
          </div>
        ) : null}
      </div>
    );
  };

  if (!participant) {
    return (
      <div className={styles.monitorStage}>
        <div className={styles.noSelection}>
          {t("proctoringPanel.emptyTitle", "選擇參賽者開始監考")}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.monitorStage}>
      <div className={styles.monitorHeader}>
        <div className={styles.monitorHeaderLeft}>
          {onBackToRoster ? (
            <Button
              kind="ghost"
              size="sm"
              renderIcon={ArrowLeft}
              iconDescription={t("proctoringPanel.backToRoster", "返回列表")}
              hasIconOnly
              onClick={onBackToRoster}
            />
          ) : null}
          <div className={styles.monitorIdentity}>
            <span className={styles.monitorName}>{participantName}</span>
            <span className={styles.monitorUsername}>@{participant.username}</span>
          </div>
        </div>
        <div className={styles.monitorActions}>
          {onToggleManualEvidence ? (
            <Button
              className={manualEvidenceActive ? styles.manualEvidenceButtonActive : undefined}
              kind="danger--ghost"
              size="md"
              renderIcon={DataCollection}
              iconDescription={manualEvidenceActive
                ? t("proctoringPanel.endManualEvidence", "結束手動採證")
                : t("proctoringPanel.startManualEvidence", "開始手動採證")}
              hasIconOnly
              disabled={!participant}
              onClick={onToggleManualEvidence}
            />
          ) : null}
          {onToggleLock ? (
            <Button
              kind={participantLocked ? "ghost" : "danger--ghost"}
              size="md"
              renderIcon={participantLocked ? Unlocked : Locked}
              iconDescription={participantLocked
                ? t("participants.actions.unlock", "解除鎖定")
                : t("participants.actions.lock", "鎖定")}
              hasIconOnly
              disabled={lockActionBusy || participant?.examStatus === "submitted"}
              onClick={onToggleLock}
            />
          ) : null}
          <Tag type={connectedCount > 0 ? "green" : "cool-gray"} size="sm">
            {connectedCount}/{visibleSources.length}
          </Tag>
        </div>
      </div>
      {panelError ? <div className={styles.monitorError}>{panelError}</div> : null}
      {visibleSources.length > 0 ? (
        <div
          className={[
            styles.videoGrid,
            visibleSources.length === 1 && styles.videoGridSingle,
          ].filter(Boolean).join(" ")}
        >
          {visibleSources.map(renderSource)}
        </div>
      ) : (
        <div className={styles.noSelection}>
          {discovering ? t("action.loading", "連線中...") : t("proctoringPanel.noSignal", "No signal")}
        </div>
      )}
    </div>
  );
});

interface EvidenceStripProps {
  contestId: string;
  participant: ContestParticipant | null;
  incident: EventFeedItem | null;
}

const EvidenceStrip = ({ contestId, participant, incident }: EvidenceStripProps) => {
  const { t } = useTranslation("contest");
  const [frames, setFrames] = useState<ScreenshotFrame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lightboxUrl, setLightboxUrl] = useState("");

  const incidentKey = incident?.incidentKey ?? "";
  const clipboardContentItems = useMemo(
    () => getClipboardContentItems(incident?.metadata),
    [incident?.metadata],
  );
  const incidentSummary = useMemo(() => {
    if (!incident) return "";
    const reason = incident.metadata?.reason;
    const description = incident.metadata?.description;
    const module = incident.metadata?.module;
    return [
      incident.summary,
      typeof reason === "string" ? reason : "",
      typeof description === "string" ? description : "",
      typeof module === "string" ? module : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }, [incident]);

  useEffect(() => {
    if (!incident || !participant) {
      setFrames([]);
      setError("");
      return;
    }

    let cancelled = false;
    const load = async () => {
      const metadata = incident.metadata ?? {};
      const objectKeys = getEvidenceObjectKeys(metadata);
      const modules = getEvidenceModules(metadata, objectKeys);
      const sessionId = typeof metadata.upload_session_id === "string" ? metadata.upload_session_id : "";
      const evidenceClusterId = typeof metadata.evidence_cluster_id === "string" ? metadata.evidence_cluster_id : "";
      const evidenceWindowStart =
        typeof metadata.evidence_window_start === "string" ? Date.parse(metadata.evidence_window_start) : NaN;
      const evidenceWindowEnd =
        typeof metadata.evidence_window_end === "string" ? Date.parse(metadata.evidence_window_end) : NaN;
      const firstMs = new Date(incident.firstAt).getTime();
      const lastMs = new Date(incident.lastAt).getTime();

      setLoading(true);
      setError("");
      try {
        const result = await fetchScreenshots(contestId, {
          user_id: participant.userId,
          event_id: incident.eventId || undefined,
          evidence_cluster_id: evidenceClusterId || undefined,
          upload_session_id: sessionId || undefined,
          source_module: modules.length === 1 && objectKeys.length === 0 ? modules[0] : undefined,
          object_keys: objectKeys.length > 0 ? objectKeys.slice(0, 12) : undefined,
          ts_from: Number.isFinite(evidenceWindowStart) ? evidenceWindowStart : firstMs - 20_000,
          ts_to: Number.isFinite(evidenceWindowEnd) ? evidenceWindowEnd : lastMs + 20_000,
          limit: 12,
        });
        if (!cancelled) setFrames(result.items);
      } catch (err) {
        if (!cancelled) {
          setFrames([]);
          setError(err instanceof Error ? err.message : t("logs.detail.screenshotError", "截圖載入失敗"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [contestId, incident, incidentKey, participant, t]);

  const framesByModule = useMemo(() => {
    return frames.reduce<Partial<Record<LiveSource, ScreenshotFrame[]>>>((acc, frame) => {
      const module = frame.source_module === "webcam" ? "webcam" : "screen_share";
      acc[module] = [...(acc[module] ?? []), frame];
      return acc;
    }, {});
  }, [frames]);

  const renderClipboardContent = () => {
    if (clipboardContentItems.length === 0) return null;
    return (
      <div className={styles.eventContentSection}>
        <div className={styles.eventContentHeader}>
          <span>{t("logs.detail.eventContent", "事件內容")}</span>
          <span>{t("logs.detail.clipboardActionLabel", {
            defaultValue: "{{count}} 筆剪貼簿操作",
            count: clipboardContentItems.length,
          })}</span>
        </div>
        <div className={styles.eventContentList}>
          {clipboardContentItems.map((item) => (
            <div key={item.id} className={styles.eventContentItem}>
              <div className={styles.eventContentItemHeader}>
                <Tag type={item.action === "paste" ? "teal" : "cool-gray"} size="sm">
                  {item.action}
                </Tag>
                <span className={styles.eventContentMeta}>
                  {item.textLength != null
                    ? t("logs.detail.clipboardTextLength", {
                        defaultValue: "{{count}} 字",
                        count: item.textLength,
                      })
                    : null}
                  {item.lineCount != null
                    ? t("logs.detail.clipboardLineCount", {
                        defaultValue: "{{count}} 行",
                        count: item.lineCount,
                      })
                    : null}
                  {item.truncated && item.originalLength != null && item.capturedLength != null
                    ? t("logs.detail.contentTruncated", {
                        defaultValue: "已截斷：{{captured}} / {{original}} 字",
                        captured: item.capturedLength,
                        original: item.originalLength,
                      })
                    : null}
                </span>
              </div>
              {item.content ? (
                <pre className={styles.eventContentValue}>{item.content}</pre>
              ) : (
                <span className={styles.eventContentEmpty}>
                  {t("logs.detail.noClipboardContent", "此操作未保存內容")}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (!incident) {
    return (
      <div className={styles.evidenceStrip}>
        <div className={styles.evidenceEmpty}>{t("proctoringPanel.noEventSelected", "選擇事件查看截圖證據")}</div>
      </div>
    );
  }

  const hasClipboardContent = clipboardContentItems.length > 0;

  return (
    <div className={styles.evidenceStrip}>
      <div className={styles.evidenceHeader}>
        <div className={styles.evidenceTitle}>
          <Tag type={PRIORITY_TAG_COLOR[incident.priority] ?? "cool-gray"} size="sm">
            {PRIORITY_LABELS[incident.priority] ?? "P3"}
          </Tag>
          <span>{getEventLabel(t, incident.eventType)}</span>
        </div>
        <span className={styles.evidenceMeta}>{formatEventTime(incident.lastAt)}</span>
      </div>
      <div className={styles.evidenceBody}>
        {incidentSummary ? <div className={styles.evidenceSummary}>{incidentSummary}</div> : null}
        {loading ? <div className={styles.evidenceEmpty}>{t("action.loading", "連線中...")}</div> : null}
        {error ? <div className={styles.evidenceError}>{error}</div> : null}
        {!loading && !error && frames.length === 0 ? renderClipboardContent() : null}
        {frames.length > 0 ? (
          <div className={styles.evidenceGroups}>
            {SOURCE_ORDER.map((source) => {
              const sourceFrames = framesByModule[source] ?? [];
              if (sourceFrames.length === 0) return null;
              return (
                <div className={styles.evidenceGroup} key={source}>
                  <div className={styles.evidenceGroupHeader}>
                    {source === "webcam"
                      ? t("proctoringPanel.sourceWebcam", "Webcam")
                      : t("proctoringPanel.sourceScreen", "Screen")}
                  </div>
                  <div className={styles.evidenceFrames}>
                    {sourceFrames.map((frame) => (
                      <button
                        type="button"
                        key={`${source}-${frame.ts_ms}-${frame.seq}`}
                        className={styles.evidenceFrame}
                        onClick={() => setLightboxUrl(frame.url)}
                      >
                        <img src={frame.url} alt={`${source} ${frame.seq}`} loading="lazy" />
                        <span>{formatEventTime(String(frame.ts_ms))}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
        {frames.length > 0 ? renderClipboardContent() : null}
        {!loading && !error && frames.length === 0 && !hasClipboardContent ? (
          <div className={styles.evidenceEmpty}>{t("logs.detail.noScreenshots", "此事件前後時段無可用原始截圖，建議改看即時監看")}</div>
        ) : null}
      </div>
      {lightboxUrl ? (
        <div className={styles.lightbox} role="presentation" onClick={() => setLightboxUrl("")}>
          <button
            type="button"
            className={styles.lightboxClose}
            onClick={(event) => {
              event.stopPropagation();
              setLightboxUrl("");
            }}
          >
            x
          </button>
          <img src={lightboxUrl} alt="Evidence" />
        </div>
      ) : null}
    </div>
  );
};

interface EventTimelinePaneProps {
  events: EventFeedItem[];
  loading: boolean;
  error: string;
  selectedKey: string;
  onSelect: (event: EventFeedItem) => void;
}

const EventTimelinePane = ({
  events,
  loading,
  error,
  selectedKey,
  onSelect,
}: EventTimelinePaneProps) => {
  const { t } = useTranslation("contest");

  return (
    <aside className={styles.eventsPane}>
      <div className={styles.eventsHeader}>
        <span>{t("proctoringPanel.events", "事件")}</span>
        {loading ? <span className={styles.eventsLoading}>{t("action.loading", "連線中...")}</span> : null}
      </div>
      {error ? <div className={styles.eventsError}>{error}</div> : null}
      <div className={styles.eventsList}>
        {events.length === 0 && !loading ? (
          <div className={styles.eventsEmpty}>{t("proctoringPanel.noEvents", "目前沒有事件")}</div>
        ) : null}
        {events.map((event) => {
          const selected = event.incidentKey === selectedKey;
          return (
            <button
              type="button"
              key={event.incidentKey}
              className={[styles.eventItem, selected && styles.eventItemSelected].filter(Boolean).join(" ")}
              onClick={() => onSelect(event)}
            >
              <span className={styles.eventItemTop}>
                <Tag type={PRIORITY_TAG_COLOR[event.priority] ?? "cool-gray"} size="sm">
                  {PRIORITY_LABELS[event.priority] ?? "P3"}
                </Tag>
                <span className={styles.eventType}>{getEventLabel(t, event.eventType)}</span>
              </span>
              <span className={styles.eventItemMeta}>
                <span>{formatEventTime(event.lastAt)}</span>
                {event.count > 1 ? <span>x{event.count}</span> : null}
                {event.evidenceCount > 0 ? <span>{t("proctoringPanel.evidenceCount", "截圖 {{count}}", { count: event.evidenceCount })}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
};

interface ManualEvidenceModalProps {
  open: boolean;
  saving: boolean;
  participantName: string;
  startedAt: number | null;
  reason: string;
  description: string;
  onReasonChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

const ManualEvidenceModal = ({
  open,
  saving,
  participantName,
  startedAt,
  reason,
  description,
  onReasonChange,
  onDescriptionChange,
  onClose,
  onSubmit,
}: ManualEvidenceModalProps) => {
  const { t } = useTranslation("contest");
  const startedAtLabel = startedAt ? formatEventTime(startedAt) : "";

  return (
    <Modal
      open={open}
      modalHeading={t("proctoringPanel.manualEvidenceModalTitle", "建立手動採證事件")}
      primaryButtonText={saving ? t("action.loading", "連線中...") : t("button.submit", "送出")}
      secondaryButtonText={t("button.cancel", "取消")}
      primaryButtonDisabled={saving || reason.trim().length === 0}
      onRequestClose={saving ? undefined : onClose}
      onRequestSubmit={onSubmit}
    >
      <div className={styles.manualEvidenceModalBody}>
        <div className={styles.manualEvidenceMeta}>
          <span>{participantName}</span>
          {startedAtLabel ? (
            <span>{t("proctoringPanel.manualEvidenceStartedAt", "開始於 {{time}}", { time: startedAtLabel })}</span>
          ) : null}
        </div>
        <TextInput
          id="manual-evidence-reason"
          labelText={t("proctoringPanel.manualEvidenceTitle", "事件標題")}
          value={reason}
          maxLength={120}
          disabled={saving}
          onChange={(event) => onReasonChange(event.target.value)}
        />
        <TextArea
          id="manual-evidence-description"
          labelText={t("proctoringPanel.manualEvidenceDescription", "說明")}
          value={description}
          maxLength={1000}
          disabled={saving}
          onChange={(event) => onDescriptionChange(event.target.value)}
        />
      </div>
    </Modal>
  );
};

const uploadManualEvidenceFrames = async (
  contestId: string,
  userId: string | number,
  frames: ManualEvidenceFrame[],
  preferredUploadSessionId?: string,
): Promise<UploadedManualEvidence> => {
  const uploadSessionId = preferredUploadSessionId || `manual-${userId}-${Date.now()}`;
  const uploadedObjectKeys: string[] = [];
  const uploadedSeqs: number[] = [];
  const moduleResults: UploadedManualEvidence["moduleResults"] = {};

  for (const source of SOURCE_ORDER) {
    const sourceFrames = frames.filter((frame) => frame.source === source);
    if (sourceFrames.length === 0) continue;
    const urls = await getManualProctorEvidenceUrls(contestId, {
      user_id: userId,
      module: source,
      count: sourceFrames.length,
      upload_session_id: uploadSessionId,
      start_seq: 1,
      frame_timestamps: sourceFrames.map((frame) => frame.createdAt),
    });
    const uploadItems = urls.items.slice(0, sourceFrames.length);
    await uploadAnticheatBatch(
      uploadItems.map((item, index) => ({
        blob: sourceFrames[index].blob,
        put_url: item.put_url,
        required_headers: item.required_headers,
      })),
    );
    const objectKeys = uploadItems.map((item) => item.object_key);
    const seqs = uploadItems.map((item) => item.seq);
    uploadedObjectKeys.push(...objectKeys);
    uploadedSeqs.push(...seqs);
    moduleResults[source] = {
      attempted: true,
      captured: true,
      uploaded: objectKeys.length > 0,
      uploadSessionId,
      uploadedObjectKeys: objectKeys,
      uploadedSeqs: seqs,
      evidenceUploadedFrameCount: objectKeys.length,
    };
  }

  return {
    uploadSessionId,
    uploadedObjectKeys,
    uploadedSeqs,
    moduleResults,
  };
};

export default function AdminProctoringPanel({
  contestId,
  contest,
}: AdminPanelProps) {
  const { t } = useTranslation("contest");
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useMediaQuery("(max-width: 66rem)");
  const prefersReducedMotion = useReducedMotion();
  const {
    participants,
    isRefreshing,
    refreshAdminData,
    refreshParticipants,
  } = useContestAdmin();
  const { registerPanelRefresh } = useAdminPanelRefresh();
  const { confirm, modalProps } = useConfirmModal();
  const { showToast } = useToast();
  const refreshInFlightRef = useRef(false);
  const liveStageRef = useRef<ManualEvidenceCaptureHandle | null>(null);

  const selectedUserId = searchParams.get("user");
  const searchQuery = searchParams.get("q") || "";
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [rosterPaneOpen, setRosterPaneOpen] = useState(true);
  const [eventsPaneOpen, setEventsPaneOpen] = useState(true);
  const [lastSeenEventAt, setLastSeenEventAt] = useState(0);
  const [dashboard, setDashboard] = useState<ParticipantDashboard | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [selectedIncidentKey, setSelectedIncidentKey] = useState("");
  const [lockActionBusy, setLockActionBusy] = useState(false);
  const [lockReasonModalOpen, setLockReasonModalOpen] = useState(false);
  const [manualLockReason, setManualLockReason] = useState("");
  const [manualEvidenceStartedAt, setManualEvidenceStartedAt] = useState<number | null>(null);
  const [manualEvidenceUploadSessionId, setManualEvidenceUploadSessionId] = useState("");
  const [manualEvidenceModalOpen, setManualEvidenceModalOpen] = useState(false);
  const [manualEvidenceReason, setManualEvidenceReason] = useState("");
  const [manualEvidenceDescription, setManualEvidenceDescription] = useState("");
  const [manualEvidenceSaving, setManualEvidenceSaving] = useState(false);
  const [liveDiscoveryRefreshKey, setLiveDiscoveryRefreshKey] = useState(0);
  const inExamWindow = useMemo(
    () => isContestInExamWindow(contest, nowMs),
    [contest, nowMs],
  );

  const updateParams = useCallback((updates: Record<string, string | null>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      let changed = false;

      Object.entries(updates).forEach(([key, value]) => {
        const current = next.get(key);
        if (value === null || value === undefined || value === "") {
          if (current !== null) {
            next.delete(key);
            changed = true;
          }
          return;
        }

        if (current !== value) {
          next.set(key, value);
          changed = true;
        }
      });

      return changed ? next : prev;
    }, { replace: true });
  }, [setSearchParams]);

  const filteredParticipants = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const rows = query
      ? participants.filter((participant) =>
          getParticipantSearchText(participant).includes(query),
        )
      : [...participants];

    return rows.sort((left, right) => {
      const scoreDiff = getAttentionScore(right) - getAttentionScore(left);
      if (scoreDiff !== 0) return scoreDiff;
      return getParticipantDisplayName(left).localeCompare(getParticipantDisplayName(right));
    });
  }, [participants, searchQuery]);

  const selectedParticipant = useMemo(
    () =>
      participants.find((participant) => participant.userId === selectedUserId) ||
      null,
    [participants, selectedUserId],
  );

  const onlineCount = useMemo(
    () => participants.filter(isParticipantLive).length,
    [participants],
  );

  const eventFeed = dashboard?.eventFeed ?? EMPTY_EVENT_FEED;
  const latestEventAt = useMemo(
    () =>
      eventFeed.reduce((latest, event) => {
        const timestamp = Date.parse(event.lastAt);
        return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
      }, 0),
    [eventFeed],
  );
  const newCollapsedEventCount = useMemo(
    () =>
      eventsPaneOpen
        ? 0
        : eventFeed.filter((event) => {
            const timestamp = Date.parse(event.lastAt);
            return Number.isFinite(timestamp) && timestamp > lastSeenEventAt;
          }).length,
    [eventFeed, eventsPaneOpen, lastSeenEventAt],
  );
  const selectedIncident = useMemo(
    () =>
      eventFeed.find((event) => event.incidentKey === selectedIncidentKey) ||
      eventFeed.find((event) => event.evidenceCount > 0) ||
      eventFeed[0] ||
      null,
    [eventFeed, selectedIncidentKey],
  );
  const showRosterPane = isMobile ? !selectedUserId : rosterPaneOpen;
  const showMonitorPane = !isMobile || !!selectedUserId;
  const showEventsPane = !isMobile && eventsPaneOpen;
  const panelTransition = prefersReducedMotion ? { duration: 0 } : PANEL_TRANSITION;

  const refreshDashboard = useCallback(async () => {
    if (!contestId || !selectedUserId) {
      setDashboard(null);
      setDashboardError("");
      setDashboardLoading(false);
      return;
    }
    setDashboardLoading(true);
    setDashboardError("");
    setDashboard((current) => (current && current.participant.userId !== selectedUserId ? null : current));
    try {
      const next = await getParticipantDashboard(contestId, selectedUserId);
      setDashboard(next);
    } catch (error) {
      setDashboard(null);
      setDashboardError(error instanceof Error ? error.message : t("proctoringPanel.eventLoadError", "無法載入事件"));
    } finally {
      setDashboardLoading(false);
    }
  }, [contestId, selectedUserId, t]);

  const refreshPanel = useCallback(async () => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      await Promise.all([refreshAdminData(), refreshDashboard()]);
      setLiveDiscoveryRefreshKey((key) => key + 1);
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [refreshAdminData, refreshDashboard]);

  const handleToggleSelectedParticipantLock = useCallback(async () => {
    if (!contestId || !selectedParticipant) return;
    const locked = selectedParticipant.examStatus === "locked";
    if (!locked) {
      setManualLockReason("");
      setLockReasonModalOpen(true);
      return;
    }
    const confirmed = await confirm({
      title: t("participants.confirmUnlock", "確定要解除此學生的鎖定嗎？"),
      confirmLabel: t("participants.unlock", "解除"),
      cancelLabel: t("button.cancel", "取消"),
      danger: true,
    });
    if (!confirmed) return;

    setLockActionBusy(true);
    try {
      await unlockParticipant(contestId, Number(selectedParticipant.userId));
      await refreshPanel();
      showToast({
        kind: "success",
        title: t("common.success", "成功"),
        subtitle: t("participants.unlocked", "已解除鎖定"),
      });
    } catch (error) {
      showToast({
        kind: "error",
        title: t("common.error", "錯誤"),
        subtitle: error instanceof Error
          ? error.message
          : t("participants.unlockFailed", "解除鎖定失敗"),
      });
    } finally {
      setLockActionBusy(false);
    }
  }, [confirm, contestId, refreshPanel, selectedParticipant, showToast, t]);

  const handleSubmitManualLock = useCallback(async () => {
    if (!contestId || !selectedParticipant) return;
    setLockActionBusy(true);
    try {
      await updateParticipant(contestId, Number(selectedParticipant.userId), {
        exam_status: "locked",
        lock_reason: manualLockReason.trim(),
      });
      setLockReasonModalOpen(false);
      setManualLockReason("");
      await refreshPanel();
      showToast({
        kind: "success",
        title: t("common.success", "成功"),
        subtitle: t("participants.locked", "已鎖定"),
      });
    } catch (error) {
      showToast({
        kind: "error",
        title: t("common.error", "錯誤"),
        subtitle: error instanceof Error ? error.message : t("participants.lockFailed", "鎖定失敗"),
      });
    } finally {
      setLockActionBusy(false);
    }
  }, [contestId, manualLockReason, refreshPanel, selectedParticipant, showToast, t]);

  const handleToggleManualEvidence = useCallback(() => {
    if (!selectedParticipant) return;
    if (!manualEvidenceStartedAt) {
      const startedAt = Date.now();
      setManualEvidenceStartedAt(startedAt);
      setManualEvidenceUploadSessionId(`manual-${selectedParticipant.userId}-${startedAt}`);
      setManualEvidenceReason(t("proctoringPanel.manualEvidenceDefaultTitle", "手動採證"));
      setManualEvidenceDescription("");
      showToast({
        kind: "info",
        title: t("proctoringPanel.manualEvidenceStarted", "已開始手動採證"),
        subtitle: getParticipantDisplayName(selectedParticipant),
      });
      return;
    }
    setManualEvidenceModalOpen(true);
  }, [manualEvidenceStartedAt, selectedParticipant, showToast, t]);

  const handleCancelManualEvidenceModal = useCallback(() => {
    if (manualEvidenceSaving) return;
    setManualEvidenceModalOpen(false);
  }, [manualEvidenceSaving]);

  const handleSubmitManualEvidence = useCallback(async () => {
    if (!contestId || !selectedParticipant || !manualEvidenceStartedAt) return;
    const reason = manualEvidenceReason.trim();
    if (!reason) return;
    const endedAt = Date.now();
    setManualEvidenceSaving(true);
    try {
      const capturedFrames = await liveStageRef.current?.collectManualEvidenceFrames() ?? [];
      const uploadResult = capturedFrames.length > 0
        ? await uploadManualEvidenceFrames(
            contestId,
            selectedParticipant.userId,
            capturedFrames,
            manualEvidenceUploadSessionId || undefined,
          )
        : {
            uploadSessionId: "",
            uploadedObjectKeys: [],
            uploadedSeqs: [],
            moduleResults: {},
          };
      await createManualProctorEvent(contestId, {
        user_id: selectedParticipant.userId,
        started_at: new Date(manualEvidenceStartedAt).toISOString(),
        ended_at: new Date(endedAt).toISOString(),
        reason,
        description: manualEvidenceDescription.trim(),
        upload_session_id: uploadResult.uploadedObjectKeys.length > 0 ? uploadResult.uploadSessionId : undefined,
        uploaded_object_keys: uploadResult.uploadedObjectKeys,
        uploaded_seqs: uploadResult.uploadedSeqs,
        module_results: uploadResult.moduleResults,
      });
      setManualEvidenceStartedAt(null);
      setManualEvidenceUploadSessionId("");
      setManualEvidenceModalOpen(false);
      setManualEvidenceReason("");
      setManualEvidenceDescription("");
      await refreshPanel();
      showToast({
        kind: "success",
        title: t("common.success", "成功"),
        subtitle: t("proctoringPanel.manualEvidenceCreated", "已建立手動採證事件"),
      });
    } catch (error) {
      showToast({
        kind: "error",
        title: t("common.error", "錯誤"),
        subtitle: error instanceof Error
          ? error.message
          : t("proctoringPanel.manualEvidenceCreateFailed", "建立手動採證事件失敗"),
      });
    } finally {
      setManualEvidenceSaving(false);
    }
  }, [
    contestId,
    manualEvidenceDescription,
    manualEvidenceReason,
    manualEvidenceStartedAt,
    manualEvidenceUploadSessionId,
    refreshPanel,
    selectedParticipant,
    showToast,
    t,
  ]);

  useEffect(() => {
    setManualEvidenceStartedAt(null);
    setManualEvidenceUploadSessionId("");
    setManualEvidenceModalOpen(false);
    setManualEvidenceReason("");
    setManualEvidenceDescription("");
  }, [selectedUserId]);

  useEffect(() => {
    return registerPanelRefresh("proctoring", refreshPanel);
  }, [refreshPanel, registerPanelRefresh]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    void refreshDashboard();
  }, [refreshDashboard]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshPanel();
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, [refreshPanel]);

  useEffect(() => {
    if (!contestId) return;

    const refreshLiveStatuses = async () => {
      if (document.visibilityState !== "visible") return;
      await refreshParticipants();
    };

    const intervalId = window.setInterval(() => {
      void refreshLiveStatuses();
    }, LIVE_STATUS_REFRESH_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshLiveStatuses();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [contestId, refreshParticipants]);

  useEffect(() => {
    setLastSeenEventAt(Date.now());
  }, [selectedUserId]);

  useEffect(() => {
    if (eventsPaneOpen && latestEventAt > 0) {
      setLastSeenEventAt(latestEventAt);
    }
  }, [eventsPaneOpen, latestEventAt, selectedUserId]);

  useEffect(() => {
    if (!selectedIncidentKey) return;
    if (!eventFeed.some((event) => event.incidentKey === selectedIncidentKey)) {
      setSelectedIncidentKey("");
    }
  }, [eventFeed, selectedIncidentKey]);

  useEffect(() => {
    if (filteredParticipants.length === 0) {
      if (selectedUserId) updateParams({ user: null });
      return;
    }

    const selectedVisible = filteredParticipants.some(
      (participant) => participant.userId === selectedUserId,
    );
    if (isMobile) {
      if (selectedUserId && !selectedVisible) {
        updateParams({ user: null });
      }
      return;
    }

    if (!selectedVisible) {
      updateParams({ user: filteredParticipants[0].userId });
    }
  }, [filteredParticipants, isMobile, selectedUserId, updateParams]);

  const renderParticipant = (participant: ContestParticipant) => {
    const selected = participant.userId === selectedUserId;
    const live = isParticipantLive(participant);
    const attentionLevel = getAttentionLevel(participant);
    const displayName = getParticipantDisplayName(participant);
    const StatusIcon = attentionLevel !== "none"
      ? WarningFilled
      : participant.examStatus === "submitted"
        ? CheckmarkFilled
        : participant.examStatus === "paused" || participant.examStatus === "locked"
          ? PauseFilled
          : InProgress;

    return (
      <button
        key={participant.userId}
        type="button"
        className={[
          styles.rosterItem,
          selected && styles.rosterItemSelected,
          attentionLevel === "low" && styles.rosterItemLow,
          attentionLevel === "medium" && styles.rosterItemMedium,
          attentionLevel === "high" && styles.rosterItemHigh,
        ].filter(Boolean).join(" ")}
        disabled={!inExamWindow}
        onClick={() => updateParams({ user: participant.userId })}
      >
        <span className={styles.rosterStatusIcon}>
          <StatusIcon size={16} />
        </span>
        <span className={styles.rosterIdentity}>
          <span className={styles.rosterName}>{displayName}</span>
          <span className={styles.rosterUsername}>@{participant.username}</span>
        </span>
        <span className={styles.rosterSignals}>
          {participant.violationCount > 0 ? (
            <span className={`${styles.violationPill} ${
              attentionLevel === "high"
                ? styles.violationPillHigh
                : attentionLevel === "medium"
                  ? styles.violationPillMedium
                  : styles.violationPillLow
            }`}
            >
              {participant.violationCount}
            </span>
          ) : null}
          <span className={live ? styles.liveDot : styles.offlineDot} />
        </span>
      </button>
    );
  };

  return (
    <div className={styles.page}>
      <PanelToolbar
        leftActions={!isMobile ? (
          <div className={styles.rosterToggle}>
            <Button
              kind="ghost"
              size="md"
              hasIconOnly
              renderIcon={UserMultiple}
              iconDescription={t(
                rosterPaneOpen ? "proctoringPanel.hideRoster" : "proctoringPanel.showRoster",
                rosterPaneOpen ? "隱藏監考對象" : "顯示監考對象",
              )}
              onClick={() => setRosterPaneOpen((open) => !open)}
            />
            {!rosterPaneOpen ? (
              <span className={styles.rosterToggleBadge} aria-label={t("proctoringPanel.onlineCount", "{{count}} 人在線", { count: onlineCount })}>
                {onlineCount}
              </span>
            ) : null}
          </div>
        ) : undefined}
        title={t("proctoringPanel.title", "監考面板")}
        actions={(
          <>
            <div className={styles.toolbarSearch}>
              <TableToolbarSearch
                labelText={t("participants.searchLabel", "搜尋參賽者")}
                placeholder={t("proctoringPanel.searchPlaceholder", "搜尋監考對象...")}
                size="md"
                value={searchQuery}
                onChange={(event) => {
                  if (event && typeof event !== "string" && "target" in event) {
                    updateParams({ q: event.target.value || null });
                  }
                }}
                persistent
              />
            </div>
            <Button
              kind="ghost"
              size="md"
              renderIcon={Renew}
              iconDescription={t("adminLayout.header.refresh", "重新整理")}
              hasIconOnly
              disabled={isRefreshing}
              onClick={() => void refreshPanel()}
            />
            {newCollapsedEventCount > 0 ? (
              <Tag type="teal" size="sm">
                {t("proctoringPanel.newEventCount", "新事件 {{count}}", { count: newCollapsedEventCount })}
              </Tag>
            ) : null}
            {!isMobile ? (
              <Button
                kind={eventsPaneOpen ? "primary" : "ghost"}
                size="md"
                hasIconOnly
                renderIcon={eventsPaneOpen ? RightPanelClose : RightPanelOpen}
                iconDescription={t(
                  eventsPaneOpen ? "proctoringPanel.hideEvents" : "proctoringPanel.showEvents",
                  eventsPaneOpen ? "隱藏事件列表" : "顯示事件列表",
                )}
                onClick={() => {
                  setEventsPaneOpen((open) => {
                    const nextOpen = !open;
                    if (nextOpen && latestEventAt > 0) {
                      setLastSeenEventAt(latestEventAt);
                    }
                    return nextOpen;
                  });
                }}
              />
            ) : null}
          </>
        )}
      />

      <motion.div
        className={styles.workspace}
        animate={{
          gridTemplateColumns: isMobile
            ? "minmax(0, 1fr)"
            : showRosterPane
              ? "20rem minmax(0, 1fr)"
              : "0rem minmax(0, 1fr)",
        }}
        transition={panelTransition}
      >
        <AnimatePresence initial={false}>
          {showRosterPane ? (
            <motion.aside
              key="roster"
              className={`${styles.rosterPane} ${!inExamWindow ? styles.rosterPaneDisabled : ""}`}
              initial={prefersReducedMotion ? { opacity: 1, x: 0 } : { opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={prefersReducedMotion ? { opacity: 1, x: 0 } : { opacity: 0, x: -24 }}
              transition={panelTransition}
            >
              <div className={styles.rosterHeader}>
                <span>{t("proctoringPanel.roster", "監考對象")}</span>
                <span>{filteredParticipants.length}/{participants.length}</span>
              </div>
              <div className={styles.rosterList}>
                {filteredParticipants.map(renderParticipant)}
              </div>
            </motion.aside>
          ) : null}
        </AnimatePresence>

        {showMonitorPane ? (
          <motion.section
            className={[styles.monitorPane, !showEventsPane && styles.monitorPaneEventsCollapsed].filter(Boolean).join(" ")}
            style={{
              gridColumn: !isMobile && !showRosterPane ? "2 / 3" : undefined,
            }}
            animate={{
              gridTemplateColumns: isMobile
                ? "minmax(0, 1fr)"
                : showEventsPane
                  ? "minmax(0, 1fr) minmax(20rem, 23rem)"
                  : "minmax(0, 1fr) 0rem",
            }}
            transition={panelTransition}
          >
            {inExamWindow ? (
              <>
                <div className={styles.monitorColumn}>
                  <MinimalLiveStage
                    ref={liveStageRef}
                    contestId={contestId}
                    participant={selectedParticipant}
                    discoveryRefreshKey={liveDiscoveryRefreshKey}
                    lockActionBusy={lockActionBusy}
                    manualEvidenceActive={manualEvidenceStartedAt !== null}
                    onToggleManualEvidence={selectedParticipant ? handleToggleManualEvidence : undefined}
                    onToggleLock={selectedParticipant ? handleToggleSelectedParticipantLock : undefined}
                    onBackToRoster={isMobile ? () => updateParams({ user: null }) : undefined}
                  />
                  <EvidenceStrip
                    contestId={contestId}
                    participant={selectedParticipant}
                    incident={selectedIncident}
                  />
                </div>
                <AnimatePresence initial={false}>
                  {showEventsPane ? (
                    <motion.div
                      key="events"
                      className={styles.eventsMotionSlot}
                      initial={prefersReducedMotion ? { opacity: 1, x: 0 } : { opacity: 0, x: 24 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={prefersReducedMotion ? { opacity: 1, x: 0 } : { opacity: 0, x: 24 }}
                      transition={panelTransition}
                    >
                      <EventTimelinePane
                        events={eventFeed}
                        loading={dashboardLoading}
                        error={dashboardError}
                        selectedKey={selectedIncident?.incidentKey ?? ""}
                        onSelect={(event) => setSelectedIncidentKey(event.incidentKey)}
                      />
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </>
            ) : (
              <div className={styles.unavailableState}>
                <h3>{t("proctoringPanel.outOfWindowTitle", "目前非考試時段")}</h3>
                <p>{t("proctoringPanel.outOfWindowBody", "監控功能無法使用。")}</p>
              </div>
            )}
          </motion.section>
        ) : null}
      </motion.div>
      <ManualEvidenceModal
        open={manualEvidenceModalOpen}
        saving={manualEvidenceSaving}
        participantName={selectedParticipant ? getParticipantDisplayName(selectedParticipant) : ""}
        startedAt={manualEvidenceStartedAt}
        reason={manualEvidenceReason}
        description={manualEvidenceDescription}
        onReasonChange={setManualEvidenceReason}
        onDescriptionChange={setManualEvidenceDescription}
        onClose={handleCancelManualEvidenceModal}
        onSubmit={() => void handleSubmitManualEvidence()}
      />
      <Modal
        open={lockReasonModalOpen}
        modalHeading={t("proctoringPanel.manualLockModalTitle", "鎖定參賽者")}
        primaryButtonText={lockActionBusy ? t("action.loading", "連線中...") : t("participants.actions.lock", "鎖定")}
        secondaryButtonText={t("button.cancel", "取消")}
        primaryButtonDisabled={lockActionBusy}
        onRequestClose={lockActionBusy ? undefined : () => setLockReasonModalOpen(false)}
        onRequestSubmit={() => void handleSubmitManualLock()}
      >
        <TextArea
          id="manual-lock-reason"
          labelText={t("proctoringPanel.manualLockReasonLabel", "鎖定原因")}
          value={manualLockReason}
          maxLength={500}
          disabled={lockActionBusy}
          onChange={(event) => setManualLockReason(event.target.value)}
        />
      </Modal>
      <ConfirmModal {...modalProps} />
    </div>
  );
}
