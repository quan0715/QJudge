import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, TableToolbarSearch, Tag } from "@carbon/react";
import {
  ArrowLeft,
  CheckmarkFilled,
  InProgress,
  PauseFilled,
  Renew,
  WarningFilled,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";

import type { ContestDetail, ContestParticipant } from "@/core/entities/contest.entity";
import type { AdminPanelProps } from "@/features/contest/modules/types";
import { createSfuLiveSubscriber } from "@/features/contest/anticheat/sfuLiveSubscriber";
import { useAdminPanelRefresh, useContestAdmin } from "@/features/contest/contexts";
import {
  getRealtimeSfuPublisher,
  type RealtimeSfuPublisherDto,
  type RealtimeSfuSourceModule,
} from "@/infrastructure/api/repositories/exam.repository";
import { useMediaQuery } from "@/shared/hooks";
import { PanelToolbar } from "@/shared/ui/list/PanelToolbar";

import styles from "./AdminProctoringPanel.module.scss";

type LiveSource = RealtimeSfuSourceModule;

interface SourceViewState {
  busy: boolean;
  isStreaming: boolean;
  errorMessage: string;
}

const SOURCE_ORDER: LiveSource[] = ["screen_share", "webcam"];

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

interface MinimalLiveStageProps {
  contestId: string;
  participant: ContestParticipant | null;
  reloadKey: number;
  onBackToRoster?: () => void;
}

const MinimalLiveStage = ({
  contestId,
  participant,
  reloadKey,
  onBackToRoster,
}: MinimalLiveStageProps) => {
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
  const handledReloadKeyRef = useRef(reloadKey);
  const [sourceStates, setSourceStates] = useState(createInitialSourceState);
  const [publishers, setPublishers] = useState<RealtimeSfuPublisherDto[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [panelError, setPanelError] = useState("");

  const userId = participant?.userId;
  const participantName = participant ? getParticipantDisplayName(participant) : "";

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
      setPublishers(normalizePublishers(result.publishers ?? (result.publisher ? [result.publisher] : [])));
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

  useEffect(() => {
    if (handledReloadKeyRef.current === reloadKey) return;
    handledReloadKeyRef.current = reloadKey;
    if (!participant) return;
    stopAll();
    setSourceStates(createInitialSourceState());
    void refreshSessions();
  }, [participant, refreshSessions, reloadKey, stopAll]);

  useEffect(() => () => stopAll(), [stopAll]);

  const availableSources = useMemo(
    () => publishers.map((publisher) => inferSourceModule(publisher)),
    [publishers],
  );
  const availableSourceSet = useMemo(() => new Set(availableSources), [availableSources]);

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

  const renderSource = (source: LiveSource) => {
    const sourceState = sourceStates[source];
    const available = availableSourceSet.has(source);
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
                : t("proctoringPanel.noSignal", "No signal")}
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
            <span>{available || sourceState.busy ? t("action.loading", "連線中...") : t("proctoringPanel.noSignal", "No signal")}</span>
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
          <Tag type={connectedCount > 0 ? "green" : "cool-gray"} size="sm">
            {connectedCount}/{SOURCE_ORDER.length}
          </Tag>
        </div>
      </div>
      {panelError ? <div className={styles.monitorError}>{panelError}</div> : null}
      <div className={styles.videoGrid}>
        {SOURCE_ORDER.map(renderSource)}
      </div>
    </div>
  );
};

export default function AdminProctoringPanel({
  contestId,
  contest,
}: AdminPanelProps) {
  const { t } = useTranslation("contest");
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useMediaQuery("(max-width: 66rem)");
  const { participants, isRefreshing, refreshAdminData } = useContestAdmin();
  const { registerPanelRefresh } = useAdminPanelRefresh();
  const refreshInFlightRef = useRef(false);

  const selectedUserId = searchParams.get("user");
  const searchQuery = searchParams.get("q") || "";
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [liveReloadKey, setLiveReloadKey] = useState(0);
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
  const reviewCount = useMemo(
    () => participants.filter((participant) => {
      const level = getAttentionLevel(participant);
      return level === "low" || level === "medium";
    }).length,
    [participants],
  );
  const highRiskCount = useMemo(
    () => participants.filter((participant) => getAttentionLevel(participant) === "high").length,
    [participants],
  );
  const showRosterPane = !isMobile || !selectedUserId;
  const showMonitorPane = !isMobile || !!selectedUserId;

  const refreshPanel = useCallback(async () => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      await refreshAdminData();
      setLiveReloadKey((key) => key + 1);
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [refreshAdminData]);

  useEffect(() => {
    return registerPanelRefresh("proctoring", refreshPanel);
  }, [refreshPanel, registerPanelRefresh]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(intervalId);
  }, []);

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
        title={t("proctoringPanel.title", "監考")}
        status={(
          <div className={styles.toolbarStatus}>
            <Tag type={highRiskCount > 0 ? "red" : "cool-gray"} size="sm">
              {t("proctoringPanel.highRiskCount", "{{count}} 高風險", {
                count: highRiskCount,
              })}
            </Tag>
            <Tag type={reviewCount > 0 ? "warm-gray" : "cool-gray"} size="sm">
              {t("proctoringPanel.reviewCount", "{{count}} 需留意", {
                count: reviewCount,
              })}
            </Tag>
            <Tag type={onlineCount > 0 ? "green" : "cool-gray"} size="sm">
              {t("proctoringPanel.onlineCount", "{{count}} 人在線", {
                count: onlineCount,
              })}
            </Tag>
          </div>
        )}
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
          </>
        )}
      />

      <div className={styles.workspace}>
        {showRosterPane ? (
          <aside className={`${styles.rosterPane} ${!inExamWindow ? styles.rosterPaneDisabled : ""}`}>
            <div className={styles.rosterHeader}>
              <span>{t("proctoringPanel.roster", "監考對象")}</span>
              <span>{filteredParticipants.length}/{participants.length}</span>
            </div>
            <div className={styles.rosterList}>
              {filteredParticipants.map(renderParticipant)}
            </div>
          </aside>
        ) : null}

        {showMonitorPane ? (
          <section className={styles.monitorPane}>
            {inExamWindow ? (
              <MinimalLiveStage
                contestId={contestId}
                participant={selectedParticipant}
                reloadKey={liveReloadKey}
                onBackToRoster={isMobile ? () => updateParams({ user: null }) : undefined}
              />
            ) : (
              <div className={styles.unavailableState}>
                <h3>{t("proctoringPanel.outOfWindowTitle", "目前非考試時段")}</h3>
                <p>{t("proctoringPanel.outOfWindowBody", "監控功能無法使用。")}</p>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
