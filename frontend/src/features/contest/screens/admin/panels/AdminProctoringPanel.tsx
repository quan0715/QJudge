import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, Modal, TableToolbarSearch, Tag, TextArea } from "@carbon/react";
import {
  ArrowLeft,
  CheckmarkFilled,
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
import { useTranslation } from "react-i18next";

import type { ContestDetail, ContestParticipant, EventFeedItem, ParticipantDashboard } from "@/core/entities/contest.entity";
import type {
  LiveSource,
  LiveState,
  LiveTargetSnapshot,
} from "@/core/entities/liveMonitoring.entity";
import type { AdminPanelProps } from "@/features/contest/modules/types";
import EventIncidentCard from "@/features/contest/components/admin/EventIncidentCard";
import IncidentDetail from "@/features/contest/components/admin/IncidentDetail";
import { useAdminPanelRefresh, useContestAdmin } from "@/features/contest/contexts";
import {
  getParticipantDashboard,
  unlockParticipant,
  updateParticipant,
} from "@/infrastructure/api/repositories";
import {
  getLiveMonitoringConfig,
  getLiveMonitoringTargets,
  requestLiveMonitoringToken,
} from "@/infrastructure/api/repositories/liveMonitoring.repository";
import {
  createLiveKitTransport,
  type LiveTransport,
} from "@/infrastructure/realtime/livekitTransport";
import { useMediaQuery } from "@/shared/hooks";
import { useToast } from "@/shared/contexts/ToastContext";
import { PanelToolbar } from "@/shared/ui/list/PanelToolbar";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";

import styles from "./AdminProctoringPanel.module.scss";

const SOURCE_ORDER: LiveSource[] = ["screen_share", "webcam"];
const EMPTY_EVENT_FEED: EventFeedItem[] = [];
const AUTO_REFRESH_MS = 30000;
const LIVE_STATUS_REFRESH_MS = 10000;
const PANEL_TRANSITION = {
  duration: 0.22,
  ease: [0.2, 0, 0.38, 0.9] as const,
};

const getParticipantDisplayName = (participant: ContestParticipant) =>
  participant.displayName ||
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
    participant.displayName,
    participant.email,
    participant.examStatus,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

interface MinimalLiveStageProps {
  contestId: string;
  participant: ContestParticipant | null;
  discoveryRefreshKey: number;
  lockActionBusy: boolean;
  monitoringAvailable: boolean;
  onToggleLock?: () => void;
  onBackToRoster?: () => void;
}

export const MinimalLiveStage = ({
  contestId,
  participant,
  discoveryRefreshKey,
  lockActionBusy,
  monitoringAvailable,
  onToggleLock,
  onBackToRoster,
}: MinimalLiveStageProps) => {
  const { t } = useTranslation("contest");
  const videoRefs = useRef<Record<LiveSource, HTMLVideoElement | null>>({
    screen_share: null,
    webcam: null,
  });
  const transportRef = useRef<LiveTransport | null>(null);
  const transportGenerationRef = useRef(0);
  const selectedIdentityRef = useRef<string | null>(null);
  const [transportState, setTransportState] = useState<LiveState>("idle");
  const [snapshot, setSnapshot] = useState<LiveTargetSnapshot>({
    observedAt: null,
    stale: true,
    targets: [],
  });
  const [visibleSources, setVisibleSources] = useState<LiveSource[]>([]);
  const [playingSources, setPlayingSources] = useState<LiveSource[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [panelError, setPanelError] = useState("");

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

  useEffect(() => {
    const generation = ++transportGenerationRef.current;
    const controller = new AbortController();
    let candidate: LiveTransport | null = null;
    let unsubscribe: (() => void) | null = null;

    if (!contestId || !monitoringAvailable) {
      const previous = transportRef.current;
      transportRef.current = null;
      void previous?.close();
      setTransportState(monitoringAvailable ? "idle" : "unavailable");
      return () => {
        controller.abort();
        transportGenerationRef.current += 1;
      };
    }

    setTransportState("connecting");
    void (async () => {
      try {
        const config = await getLiveMonitoringConfig(contestId, controller.signal);
        if (controller.signal.aborted || transportGenerationRef.current !== generation) return;
        if (!config.enabled || !config.configured || config.provider !== "livekit") {
          setTransportState("unavailable");
          return;
        }
        const grant = await requestLiveMonitoringToken(contestId, {
          role: "subscriber",
          signal: controller.signal,
        });
        if (controller.signal.aborted || transportGenerationRef.current !== generation) return;
        candidate = createLiveKitTransport();
        unsubscribe = candidate.onState((nextState) => {
          if (!controller.signal.aborted && transportGenerationRef.current === generation) {
            setTransportState(nextState);
          }
        });
        await candidate.connect(grant);
        if (controller.signal.aborted || transportGenerationRef.current !== generation) {
          await candidate.close();
          return;
        }
        transportRef.current = candidate;
        candidate.selectTarget(selectedIdentityRef.current);
        SOURCE_ORDER.forEach((source) => candidate?.bindVideo(source, videoRefs.current[source]));
      } catch {
        if (controller.signal.aborted || transportGenerationRef.current !== generation) return;
        setTransportState("unavailable");
        unsubscribe?.();
        unsubscribe = null;
        await candidate?.close();
      }
    })();

    return () => {
      controller.abort();
      transportGenerationRef.current += 1;
      unsubscribe?.();
      unsubscribe = null;
      const previous = transportRef.current;
      transportRef.current = null;
      void previous?.close();
      if (candidate && candidate !== previous) void candidate.close();
    };
  }, [contestId, monitoringAvailable]);

  const refreshTargets = useCallback(async () => {
    if (!contestId || !monitoringAvailable) return;
    setDiscovering(true);
    try {
      const next = await getLiveMonitoringTargets(contestId);
      setSnapshot(next);
      setPanelError("");
      if (next.stale) return;
      const target = next.targets.find((item) => item.userId === userId);
      selectedIdentityRef.current = target?.identity ?? null;
      setVisibleSources(target?.sources ?? []);
      setPlayingSources([]);
      transportRef.current?.selectTarget(selectedIdentityRef.current);
    } catch (error) {
      setSnapshot((current) => ({ ...current, stale: true }));
      setPanelError(error instanceof Error ? error.message : t("liveView.discoveryError", "無法取得目前可監看的來源"));
    } finally {
      setDiscovering(false);
    }
  }, [contestId, monitoringAvailable, t, userId]);

  useEffect(() => {
    selectedIdentityRef.current = null;
    setVisibleSources([]);
    setPlayingSources([]);
    transportRef.current?.selectTarget(null);
    SOURCE_ORDER.forEach((source) => {
      const video = videoRefs.current[source];
      if (video) video.srcObject = null;
    });
    setPanelError("");
  }, [userId]);

  useEffect(() => {
    void refreshTargets();
    if (!monitoringAvailable) return;
    const intervalId = window.setInterval(() => void refreshTargets(), LIVE_STATUS_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, [monitoringAvailable, refreshTargets]);

  useEffect(() => {
    if (!participant || !monitoringAvailable) return;
    void refreshTargets();
  }, [discoveryRefreshKey, monitoringAvailable, participant, refreshTargets]);

  useEffect(() => {
    const transport = transportRef.current;
    if (!transport) return;
    transport.selectTarget(selectedIdentityRef.current);
    SOURCE_ORDER.forEach((source) => transport.bindVideo(source, videoRefs.current[source]));
  }, [transportState]);

  const markPlaying = useCallback((source: LiveSource) => {
    setPlayingSources((current) => current.includes(source) ? current : [...current, source]);
  }, []);

  const markNotPlaying = useCallback((source: LiveSource) => {
    setPlayingSources((current) => current.filter((item) => item !== source));
  }, []);

  const renderSource = (source: LiveSource) => {
    const connected = playingSources.includes(source);
    const waiting = !connected && (transportState === "connecting" || transportState === "reconnecting");

    return (
      <div
        key={source}
        className={`${styles.videoPane} ${source === "screen_share" ? styles.screenPane : styles.webcamPane}`}
      >
        <div className={styles.videoMeta}>
          <span>{sourceLabels[source]}</span>
          <span className={connected ? styles.signalLive : styles.signalMuted}>
            {waiting
              ? t("action.loading", "連線中...")
              : connected
                ? t("liveView.connected", "已連線")
                : t("proctoringPanel.noSignal", "No signal")}
          </span>
        </div>
        <video
          ref={(node) => {
            videoRefs.current[source] = node;
            transportRef.current?.bindVideo(source, node);
          }}
          className={styles.video}
          autoPlay
          playsInline
          muted
          onPlaying={() => markPlaying(source)}
          onPause={() => markNotPlaying(source)}
          onEnded={() => markNotPlaying(source)}
        />
        {!connected ? (
          <div className={styles.blankVideo}>
            <span>{waiting ? t("action.loading", "連線中...") : t("proctoringPanel.noSignal", "No signal")}</span>
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
          <Tag type={playingSources.length > 0 ? "green" : "cool-gray"} size="sm">
            {playingSources.length}/{visibleSources.length}
          </Tag>
        </div>
      </div>
      {panelError ? <div className={styles.monitorError}>{panelError}</div> : null}
      {snapshot.stale && visibleSources.length > 0 ? (
        <div className={styles.monitorError}>
          {t("liveView.staleSources", "來源狀態暫時無法確認，保留目前畫面。")}
        </div>
      ) : null}
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
          {discovering || transportState === "connecting"
            ? t("action.loading", "連線中...")
            : transportState === "unavailable"
              ? t("liveView.unavailable", "即時監看暫不可用")
              : t("proctoringPanel.noSignal", "No signal")}
        </div>
      )}
    </div>
  );
};

interface EventTimelinePaneProps {
  events: EventFeedItem[];
  loading: boolean;
  error: string;
  selectedKey: string;
  selectedIncident: EventFeedItem | null;
  contestId: string;
  detailOpen: boolean;
  reducedMotion: boolean;
  onSelect: (event: EventFeedItem) => void;
  onCloseDetail: () => void;
}

const EventTimelinePane = ({
  events,
  loading,
  error,
  selectedKey,
  selectedIncident,
  contestId,
  detailOpen,
  reducedMotion,
  onSelect,
  onCloseDetail,
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
            <EventIncidentCard
              key={event.incidentKey}
              incident={event}
              selected={selected}
              onSelect={onSelect}
            />
          );
        })}
      </div>
      <AnimatePresence initial={false}>
        {detailOpen && selectedIncident ? (
          <motion.div
            key={selectedIncident.incidentKey}
            className={styles.eventDetailDrawer}
            initial={reducedMotion ? { opacity: 1, x: 0 } : { opacity: 0, x: 32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reducedMotion ? { opacity: 1, x: 0 } : { opacity: 0, x: 32 }}
            transition={reducedMotion ? { duration: 0 } : PANEL_TRANSITION}
          >
            <IncidentDetail
              contestId={contestId}
              incident={selectedIncident}
              showHeader
              showMetadata={false}
              onClose={onCloseDetail}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </aside>
  );
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

  const selectedUserId = searchParams.get("user");
  const searchQuery = searchParams.get("q") || "";
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [rosterPaneOpen, setRosterPaneOpen] = useState(true);
  const [eventsPaneOpen, setEventsPaneOpen] = useState(true);
  const [eventDetailOpen, setEventDetailOpen] = useState(false);
  const [lastSeenEventAt, setLastSeenEventAt] = useState(0);
  const [dashboard, setDashboard] = useState<ParticipantDashboard | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [selectedIncidentKey, setSelectedIncidentKey] = useState("");
  const [lockActionBusy, setLockActionBusy] = useState(false);
  const [lockReasonModalOpen, setLockReasonModalOpen] = useState(false);
  const [manualLockReason, setManualLockReason] = useState("");
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
      eventFeed.find((event) => event.hasEvidence) ||
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
    setEventDetailOpen(false);
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
              className={styles.rosterPane}
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
            <div className={styles.monitorColumn}>
              <MinimalLiveStage
                contestId={contestId}
                participant={selectedParticipant}
                discoveryRefreshKey={liveDiscoveryRefreshKey}
                lockActionBusy={lockActionBusy}
                monitoringAvailable={inExamWindow}
                onToggleLock={selectedParticipant ? handleToggleSelectedParticipantLock : undefined}
                onBackToRoster={isMobile ? () => updateParams({ user: null }) : undefined}
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
                    selectedIncident={selectedIncident}
                    contestId={contestId}
                    detailOpen={eventDetailOpen}
                    reducedMotion={!!prefersReducedMotion}
                    onCloseDetail={() => setEventDetailOpen(false)}
                    onSelect={(event) => {
                      setSelectedIncidentKey(event.incidentKey);
                      setEventDetailOpen(true);
                    }}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.section>
        ) : null}
      </motion.div>
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
