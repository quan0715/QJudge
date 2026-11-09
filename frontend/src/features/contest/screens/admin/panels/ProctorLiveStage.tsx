import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button, Tag } from "@carbon/react";
import { ArrowLeft, ChevronLeft, ChevronRight, Locked, Unlocked } from "@carbon/icons-react";

import { useTranslation } from "react-i18next";

import type { ContestParticipant } from "@/core/entities/contest.entity";
import type { LiveSource, LiveTargetSnapshot } from "@/core/entities/liveMonitoring.entity";

import { getLiveMonitoringTargets } from "@/infrastructure/api/repositories/liveMonitoring.repository";
import { useLiveMonitoringConnection } from "@/features/contest/hooks/useLiveMonitoringConnection";

import ProctorMonitorGrid from "./ProctorMonitorGrid";
import { getParticipantDisplayName } from "@/features/contest/domain/participantRoster";
import styles from "./ProctorLiveStage.module.scss";

const SOURCE_ORDER: LiveSource[] = ["screen_share", "webcam"];
const LIVE_STATUS_REFRESH_MS = 10000;
const areLiveSourcesEqual = (left: LiveSource[], right: LiveSource[]) =>
  left.length === right.length && left.every((source, index) => source === right[index]);

interface MinimalLiveStageProps {
  contestId: string;
  participant: ContestParticipant | null;
  discoveryRefreshKey: number;
  reconnectKey?: number;
  lockActionBusy: boolean;
  monitoringAvailable: boolean;
  onToggleLock?: () => void;
  onBackToRoster?: () => void;
  participants?: ContestParticipant[];
  layout?: 1 | 4 | 9;
  onLayoutChange?: (layout: 1 | 4 | 9) => void;
  onSelectParticipant?: (userId: string) => void;
  showIdentity?: boolean;
  /** Controlled grid page; falls back to local state when omitted. */
  gridPage?: number;
  onGridPageChange?: (page: number) => void;
}

export const MinimalLiveStage = ({
  contestId,
  participant,
  discoveryRefreshKey,
  reconnectKey = 0,
  lockActionBusy,
  monitoringAvailable,
  onToggleLock,
  onBackToRoster,
  participants, layout = 1, onLayoutChange, onSelectParticipant,
  showIdentity = true,
  gridPage: controlledGridPage,
  onGridPageChange,
}: MinimalLiveStageProps) => {
  const { t } = useTranslation("contest");
  const videoRefs = useRef<Record<LiveSource, HTMLVideoElement | null>>({
    screen_share: null,
    webcam: null,
  });
  const discoveryControllerRef = useRef<AbortController | null>(null);
  const [localGridPage, setLocalGridPage] = useState(0);
  const gridPage = controlledGridPage ?? localGridPage;
  const setGridPage = onGridPageChange ?? setLocalGridPage;
  const selectedIdentityRef = useRef<string | null>(null);
  const discoveredSourcesRef = useRef<LiveSource[]>([]);
  const { transportRef, transport, state: transportState, reconnect } = useLiveMonitoringConnection({
    contestId, enabled: monitoringAvailable, role: "subscriber",
  });
  const previousReconnectKey = useRef(reconnectKey);
  useEffect(() => {
    if (previousReconnectKey.current !== reconnectKey) reconnect();
    previousReconnectKey.current = reconnectKey;
  }, [reconnectKey, reconnect]);
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
  const videoRefCallbacks = useMemo(
    () => ({
      screen_share: (node: HTMLVideoElement | null) => {
        videoRefs.current.screen_share = node;
        transportRef.current?.bindVideo("screen_share", node);
      },
      webcam: (node: HTMLVideoElement | null) => {
        videoRefs.current.webcam = node;
        transportRef.current?.bindVideo("webcam", node);
      },
    }),
    [transportRef],
  );

  const refreshTargets = useCallback(async () => {
    if (!contestId || !monitoringAvailable) return;
    discoveryControllerRef.current?.abort();
    const controller = new AbortController();
    discoveryControllerRef.current = controller;
    setDiscovering(true);
    try {
      const next = await getLiveMonitoringTargets(contestId, controller.signal);
      if (controller.signal.aborted) return;
      setSnapshot((current) => next.stale ? { ...current, stale: true } : next);
      setPanelError("");
      if (next.stale) return;
      const target = next.targets.find((item) => item.userId === userId);
      const nextIdentity = target?.identity ?? null;
      const nextSources = target?.sources ?? [];
      const identityChanged = selectedIdentityRef.current !== nextIdentity;
      const sourcesChanged = !areLiveSourcesEqual(discoveredSourcesRef.current, nextSources);

      selectedIdentityRef.current = nextIdentity;
      if (sourcesChanged) {
        discoveredSourcesRef.current = nextSources;
        setVisibleSources(nextSources);
        setPlayingSources((current) => {
          const nextPlaying = current.filter((source) => nextSources.includes(source));
          return nextPlaying.length === current.length ? current : nextPlaying;
        });
      }
      if (layout === 1 && (identityChanged || sourcesChanged)) {
        transportRef.current?.selectTarget(nextIdentity);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setSnapshot((current) => ({ ...current, stale: true }));
      setPanelError(error instanceof Error ? error.message : t("liveView.discoveryError", "無法取得目前可監看的來源"));
    } finally {
      if (!controller.signal.aborted) setDiscovering(false);
    }
  }, [contestId, monitoringAvailable, t, userId, layout, transportRef]);

  useEffect(() => {
    setSnapshot({ observedAt: null, stale: true, targets: [] });
  }, [contestId, monitoringAvailable]);

  useEffect(() => {
    selectedIdentityRef.current = null;
    discoveredSourcesRef.current = [];
    setVisibleSources([]);
    setPlayingSources([]);
    if (layout === 1) transportRef.current?.selectTarget(null);
    SOURCE_ORDER.forEach((source) => {
      const video = videoRefs.current[source];
      if (video) video.srcObject = null;
    });
    setPanelError("");
  }, [contestId, monitoringAvailable, userId, layout, transportRef]);

  useEffect(() => {
    void refreshTargets();
    if (!monitoringAvailable) return;
    const intervalId = window.setInterval(() => void refreshTargets(), LIVE_STATUS_REFRESH_MS);
    return () => {
      window.clearInterval(intervalId);
      discoveryControllerRef.current?.abort();
    };
  }, [monitoringAvailable, refreshTargets]);

  useEffect(() => {
    if (!userId || !monitoringAvailable) return;
    void refreshTargets();
  }, [discoveryRefreshKey, monitoringAvailable, refreshTargets, userId]);

  useEffect(() => {
    if (!transport || layout !== 1) return;
    transport.selectTarget(selectedIdentityRef.current);
    SOURCE_ORDER.forEach((source) => transport.bindVideo(source, videoRefs.current[source]));
  }, [transport, layout, transportState]);

  useEffect(() => {
    if (transportState === "unavailable" || transportState === "closed" || transportState === "connecting") setPlayingSources([]);
  }, [transportState]);

  const markPlaying = useCallback((source: LiveSource) => {
    setPlayingSources((current) => current.includes(source) ? current : [...current, source]);
  }, []);

  const markNotPlaying = useCallback((source: LiveSource) => {
    setPlayingSources((current) => current.filter((item) => item !== source));
  }, []);

  const renderSource = (source: LiveSource) => {
    const connected = transportState === "connected" && playingSources.includes(source);
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
          ref={videoRefCallbacks[source]}
          className={styles.video}
          autoPlay
          playsInline
          muted
          onPlaying={() => markPlaying(source)}
          onPause={() => markNotPlaying(source)}
          onEnded={() => markNotPlaying(source)}
          onEmptied={() => markNotPlaying(source)}
          onWaiting={() => markNotPlaying(source)}
        />
        {!connected ? (
          <div className={styles.blankVideo}>
            <span>{waiting ? t("action.loading", "連線中...") : t("proctoringPanel.noSignal", "No signal")}</span>
          </div>
        ) : null}
      </div>
    );
  };

  if (!participant && !participants) {
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
      {layout === 1 && <div className={styles.monitorHeader}>
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
          {showIdentity ? (
            <div className={styles.monitorIdentity}>
              <span className={styles.monitorName}>{participantName}</span>
            </div>
          ) : null}
        </div>
        <div className={styles.monitorActions}>
          {participants && showIdentity && <>
            <Button kind="ghost" size="sm" renderIcon={ChevronLeft} hasIconOnly
              iconDescription={t("proctoringPanel.previousStudent", "上一位")}
              disabled={!participant || participants.findIndex((row) => row.userId === userId) <= 0}
              onClick={() => { const index = participants.findIndex((row) => row.userId === userId); if (index > 0) onSelectParticipant?.(participants[index - 1].userId); }} />
            <Button kind="ghost" size="sm" renderIcon={ChevronRight} hasIconOnly
              iconDescription={t("proctoringPanel.nextStudent", "下一位")}
              disabled={!participant || participants.findIndex((row) => row.userId === userId) >= participants.length - 1}
              onClick={() => { const index = participants.findIndex((row) => row.userId === userId); if (index >= 0 && index + 1 < participants.length) onSelectParticipant?.(participants[index + 1].userId); }} />
          </>}
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
      </div>}
      {panelError ? <div className={styles.monitorError}>{panelError}</div> : null}
      {snapshot.stale && (visibleSources.length > 0 || layout !== 1) ? (
        <div className={styles.monitorError}>
          {t("liveView.staleSources", "來源狀態暫時無法確認，保留目前畫面。")}
        </div>
      ) : null}
      {layout !== 1 && participants ? <ProctorMonitorGrid
        participants={participants} snapshot={snapshot} transport={transport}
        state={transportState} size={layout} page={gridPage} onPageChange={setGridPage} onFocus={(id) => {
          onSelectParticipant?.(id); onLayoutChange?.(1);
        }} /> : visibleSources.length > 0 ? (
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
