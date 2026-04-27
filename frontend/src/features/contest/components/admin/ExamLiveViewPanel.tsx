import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  InlineNotification,
  SkeletonPlaceholder,
  Tag,
  Tile,
} from "@carbon/react";
import { Renew } from "@carbon/icons-react";

import { createSfuLiveSubscriber } from "@/features/contest/anticheat/sfuLiveSubscriber";
import {
  getRealtimeSfuPublisher,
  type RealtimeSfuPublisherDto,
  type RealtimeSfuSourceModule,
} from "@/infrastructure/api/repositories/exam.repository";

import styles from "./ExamLiveViewPanel.module.scss";

interface ExamLiveViewPanelProps {
  contestId?: string;
  userId?: string;
  participantName?: string;
  open?: boolean;
}

type LiveSource = RealtimeSfuSourceModule;

interface SourceViewState {
  busy: boolean;
  isStreaming: boolean;
  errorMessage: string;
}

const SOURCE_ORDER: LiveSource[] = ["screen_share", "webcam"];

const createInitialSourceState = (): Record<LiveSource, SourceViewState> => ({
  screen_share: {
    busy: false,
    isStreaming: false,
    errorMessage: "",
  },
  webcam: {
    busy: false,
    isStreaming: false,
    errorMessage: "",
  },
});

const inferSourceModule = (publisher: RealtimeSfuPublisherDto): LiveSource => {
  if (publisher.source_module === "webcam" || publisher.source_module === "screen_share") {
    return publisher.source_module;
  }
  return publisher.track_name.startsWith("webcam-") ? "webcam" : "screen_share";
};

const ExamLiveViewPanel = ({
  contestId,
  userId,
  participantName,
  open = true,
}: ExamLiveViewPanelProps) => {
  const { t } = useTranslation("contest");
  const videoRefs = useRef<Record<LiveSource, HTMLVideoElement | null>>({
    screen_share: null,
    webcam: null,
  });
  const targetKeyRef = useRef("");
  const subscriberRefs = useRef({
    screen_share: createSfuLiveSubscriber(),
    webcam: createSfuLiveSubscriber(),
  });
  const [sourceStates, setSourceStates] = useState(createInitialSourceState);
  const [publishers, setPublishers] = useState<RealtimeSfuPublisherDto[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [panelError, setPanelError] = useState("");
  const missingTarget = !contestId || !userId;

  const sourceLabels: Record<LiveSource, string> = useMemo(
    () => ({
      screen_share: t("liveView.sourceScreen", "Screen"),
      webcam: t("liveView.sourceWebcam", "Webcam"),
    }),
    [t]
  );

  const stopSource = useCallback(
    (source: LiveSource) => {
      subscriberRefs.current[source].stop();
      if (videoRefs.current[source]) {
        videoRefs.current[source]!.srcObject = null;
      }
      setSourceStates((current) => ({
        ...current,
        [source]: {
          ...current[source],
          busy: false,
          isStreaming: false,
          errorMessage: "",
        },
      }));
    },
    []
  );

  const stopAll = useCallback(() => {
    SOURCE_ORDER.forEach((source) => stopSource(source));
  }, [stopSource]);

  const normalizePublishers = useCallback((items: RealtimeSfuPublisherDto[]) => {
    const bySource = new Map<LiveSource, RealtimeSfuPublisherDto>();
    items.forEach((publisher) => {
      bySource.set(inferSourceModule(publisher), publisher);
    });
    return SOURCE_ORDER.flatMap((source) => {
      const publisher = bySource.get(source);
      return publisher ? [publisher] : [];
    });
  }, []);

  const refreshSessions = useCallback(async () => {
    if (missingTarget) {
      setPublishers([]);
      return;
    }
    setDiscovering(true);
    setPanelError("");
    try {
      const result = await getRealtimeSfuPublisher(contestId, userId);
      const nextPublishers = normalizePublishers(
        result.publishers ?? (result.publisher ? [result.publisher] : [])
      );
      setPublishers(nextPublishers);
    } catch (error) {
      setPublishers([]);
      setPanelError(
        error instanceof Error
          ? error.message
          : t("liveView.discoveryError", "無法取得目前可監看的 session")
      );
    } finally {
      setDiscovering(false);
    }
  }, [contestId, missingTarget, normalizePublishers, t, userId]);

  const handleRefreshSessions = useCallback(() => {
    stopAll();
    setSourceStates(createInitialSourceState());
    void refreshSessions();
  }, [refreshSessions, stopAll]);

  useEffect(() => {
    if (!open) {
      stopAll();
      return;
    }
    const nextTargetKey = `${contestId ?? ""}:${userId ?? ""}`;
    if (targetKeyRef.current !== nextTargetKey) {
      stopAll();
      setPublishers([]);
      setPanelError("");
      targetKeyRef.current = nextTargetKey;
    }
    void refreshSessions();
  }, [contestId, open, refreshSessions, stopAll, userId]);

  useEffect(() => () => stopAll(), [stopAll]);

  const availableSources = useMemo(
    () => publishers.map((publisher) => inferSourceModule(publisher)),
    [publishers]
  );
  const availableSourceSet = useMemo(() => new Set(availableSources), [availableSources]);

  const startSource = useCallback(
    async (source: LiveSource) => {
      if (missingTarget || !availableSourceSet.has(source)) return;
      setSourceStates((current) => ({
        ...current,
        [source]: {
          ...current[source],
          busy: true,
          errorMessage: "",
        },
      }));
      try {
        await subscriberRefs.current[source].subscribe(
          contestId,
          userId,
          (stream) => {
            const video = videoRefs.current[source];
            if (!video) return;
            video.srcObject = stream;
          },
          source
        );
        setSourceStates((current) => ({
          ...current,
          [source]: {
            busy: false,
            isStreaming: true,
            errorMessage: "",
          },
        }));
      } catch (error) {
        if (videoRefs.current[source]) {
          videoRefs.current[source]!.srcObject = null;
        }
        setSourceStates((current) => ({
          ...current,
          [source]: {
            busy: false,
            isStreaming: false,
            errorMessage:
              error instanceof Error
                ? error.message
                : t("liveView.unknownError", "啟動 live view 失敗"),
          },
        }));
      }
    },
    [availableSourceSet, contestId, missingTarget, t, userId]
  );

  useEffect(() => {
    if (!open || missingTarget || discovering) return;
    availableSources.forEach((source) => {
      const sourceState = sourceStates[source];
      if (sourceState.busy || sourceState.isStreaming || sourceState.errorMessage) return;
      void startSource(source);
    });
  }, [availableSources, discovering, missingTarget, open, sourceStates, startSource]);

  const connectedSources = SOURCE_ORDER.filter((source) => sourceStates[source].isStreaming);
  const statusTagType = panelError ? "red" : connectedSources.length > 0 ? "green" : "cool-gray";
  const statusTagLabel = panelError
    ? t("liveView.unavailable", "無法連線")
    : connectedSources.length > 0
      ? t("liveView.connectedCount", "已連線 {{count}} 個畫面", { count: connectedSources.length })
      : t("liveView.idle", "尚未連線");

  const renderSourcePane = (source: LiveSource) => {
    const sourceState = sourceStates[source];
    const isConnected = sourceState.isStreaming;
    const helperText = missingTarget
      ? t("liveView.missingTarget", "請先選擇參與者才能開始即時監看。")
      : availableSourceSet.has(source)
        ? t("liveView.emptySource", "進入監控頁後會自動連線 {{source}}。", {
            source: sourceLabels[source],
          })
        : t("liveView.sourceUnavailable", "目前沒有可用的 {{source}} session。", {
            source: sourceLabels[source],
          });

    return (
      <div className={styles.sourcePane} key={source}>
        <div className={styles.sourcePaneHeader}>
          <div>
            <h6 className={styles.sourceTitle}>{sourceLabels[source]}</h6>
            <p className={styles.sourceDescription}>
              {isConnected
                ? t("liveView.streamingSource", "正在監看此來源。")
                : helperText}
            </p>
          </div>
          <Tag type={isConnected ? "green" : source === "webcam" ? "purple" : "cyan"}>
            {sourceState.busy
              ? t("action.loading", "連線中…")
              : isConnected
                ? t("liveView.connected", "已連線")
                : t("liveView.ready", "可監看")}
          </Tag>
        </div>

        {sourceState.errorMessage ? (
          <InlineNotification
            kind="warning"
            lowContrast
            title={t("liveView.noticeTitle", "Live view 尚不可用")}
            subtitle={sourceState.errorMessage}
            onCloseButtonClick={() =>
              setSourceStates((current) => ({
                ...current,
                [source]: { ...current[source], errorMessage: "" },
              }))
            }
          />
        ) : null}

        <div className={styles.preview}>
          {sourceState.busy ? (
            <div className={styles.loading}>
              <SkeletonPlaceholder style={{ width: "100%", height: 220 }} />
              <div className={styles.loadingLabel}>{t("action.loading", "連線中…")}</div>
            </div>
          ) : null}
          <video
            ref={(node) => {
              videoRefs.current[source] = node;
            }}
            className={styles.video}
            autoPlay
            playsInline
            muted
            controls={isConnected && !sourceState.busy}
          />
          {!sourceState.busy && !isConnected ? (
            <div className={styles.emptyState}>{helperText}</div>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <Tile className={styles.root}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <h6 className={styles.title}>{t("liveView.title", "即時監看")}</h6>
          <p className={styles.description}>
            {participantName
              ? t("liveView.descriptionWithName", "查看 {{name}} 目前授權的監控畫面。", {
                  name: participantName,
                })
              : t("liveView.description", "查看此學生目前授權的監控畫面。")}
          </p>
        </div>
        <div className={styles.statusBlock}>
          <Tag type={statusTagType}>{statusTagLabel}</Tag>
          {availableSources.map((source) => (
            <Tag key={source} type={source === "webcam" ? "purple" : "cyan"}>
              {sourceLabels[source]}
            </Tag>
          ))}
        </div>
      </div>

      <div className={styles.sessionBar}>
        <div>
          <strong>{t("liveView.sessionsTitle", "可監看 session")}</strong>
          <p>
            {availableSources.length > 0
              ? t("liveView.sessionsFound", "已找到 {{count}} 個來源，可直接開始監看。", {
                  count: availableSources.length,
                })
              : t("liveView.sessionsEmpty", "尚未找到可監看的來源。學生需要授權 Screen 或 Webcam。")}
          </p>
        </div>
        <Button
          kind="ghost"
          size="sm"
          renderIcon={Renew}
          onClick={handleRefreshSessions}
          disabled={missingTarget || discovering}
        >
          {discovering ? t("action.loading", "連線中…") : t("liveView.refreshSessions", "重新整理")}
        </Button>
      </div>

      {panelError ? (
        <InlineNotification
          kind="warning"
          lowContrast
          title={t("liveView.noticeTitle", "Live view 尚不可用")}
          subtitle={panelError}
          onCloseButtonClick={() => setPanelError("")}
        />
      ) : null}

      {!panelError && missingTarget ? (
        <InlineNotification
          kind="info"
          lowContrast
          title={t("liveView.noticeTitle", "Live view 尚不可用")}
          subtitle={t("liveView.missingTarget", "請先選擇參與者才能開始即時監看。")}
          hideCloseButton
        />
      ) : null}

      {availableSources.length > 0 ? (
        <div className={styles.allSources}>
          <div className={styles.sourceGrid}>
            {availableSources.map((source) => renderSourcePane(source))}
          </div>
        </div>
      ) : (
        <div className={styles.noSessionState}>
          {discovering ? t("action.loading", "連線中…") : t("liveView.noSessions", "目前沒有可監看的 session。")}
        </div>
      )}
    </Tile>
  );
};

export default ExamLiveViewPanel;
