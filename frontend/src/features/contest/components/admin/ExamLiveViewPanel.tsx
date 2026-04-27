import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  InlineNotification,
  SkeletonPlaceholder,
  Tag,
  Tile,
} from "@carbon/react";
import { Renew, StopFilledAlt, View } from "@carbon/icons-react";

import {
  createSfuLiveSubscriber,
  type SfuLiveSubscriberState,
} from "@/features/contest/anticheat/sfuLiveSubscriber";

import styles from "./ExamLiveViewPanel.module.scss";

interface ExamLiveViewPanelProps {
  contestId?: string;
  userId?: string;
  participantName?: string;
  open?: boolean;
}

const ExamLiveViewPanel = ({
  contestId,
  userId,
  participantName,
  open = true,
}: ExamLiveViewPanelProps) => {
  const { t } = useTranslation("contest");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const subscriberRef = useRef(createSfuLiveSubscriber());
  const [subscriberState, setSubscriberState] =
    useState<SfuLiveSubscriberState | null>(null);
  const [busy, setBusy] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusText, setStatusText] = useState(
    t("liveView.idle", "尚未連線")
  );
  const missingTarget = !contestId || !userId;

  const stopLiveView = useCallback(() => {
    subscriberRef.current.stop();
    setSubscriberState(null);
    setIsStreaming(false);
    setStatusText(t("liveView.stopped", "Live view 已停止"));
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [t]);

  useEffect(() => {
    if (open) return;
    stopLiveView();
  }, [open, stopLiveView]);

  useEffect(() => () => subscriberRef.current.stop(), []);

  const startLiveView = useCallback(async () => {
    if (missingTarget) return;
    setBusy(true);
    setErrorMessage("");
    setStatusText(t("liveView.connect", "連線 live view 中…"));
    try {
      const nextState = await subscriberRef.current.subscribe(
        contestId,
        userId,
        (stream) => {
          if (!videoRef.current) return;
          videoRef.current.srcObject = stream;
        }
      );
      setSubscriberState(nextState);
      setIsStreaming(true);
      setStatusText(t("liveView.connected", "Live view 已連線"));
    } catch (error) {
      setSubscriberState(null);
      setIsStreaming(false);
      setStatusText(t("liveView.connectError", "Live view 連線失敗"));
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t("liveView.unknownError", "啟動 live view 失敗")
      );
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    } finally {
      setBusy(false);
    }
  }, [contestId, t, userId, missingTarget]);

  const canStart = Boolean(contestId && userId && !busy);
  const isConnected = Boolean(subscriberState && isStreaming);
  const statusTagType = isConnected ? "green" : errorMessage ? "red" : "cool-gray";
  const statusTagLabel =
    isConnected
      ? t("liveView.connected", "已連線")
      : errorMessage
        ? t("liveView.unavailable", "無法連線")
        : statusText;

  const helperText = missingTarget
    ? t("liveView.missingTarget", "請先選擇參與者才能開始即時監看。")
    : isConnected
      ? t("liveView.streamingHint", "可在此畫面查看學生目前分享的螢幕。")
      : t("liveView.empty", "按下「連線即時監看」後會在這裡顯示學生畫面。");

  return (
    <Tile className={styles.root}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <h6 className={styles.title}>
            {t("liveView.title", "即時監看")}
          </h6>
          <p className={styles.description}>
            {participantName
              ? t("liveView.descriptionWithName", "查看 {{name}} 目前分享中的考試畫面。", {
                  name: participantName,
                })
              : t("liveView.description", "查看此學生目前分享中的考試畫面。")}
          </p>
        </div>
        <div className={styles.statusBlock}>
          <Tag type={statusTagType}>{statusTagLabel}</Tag>
        </div>
      </div>

      {errorMessage ? (
        <InlineNotification
          kind="warning"
          lowContrast
          title={t("liveView.noticeTitle", "Live view 尚不可用")}
          subtitle={errorMessage}
          onCloseButtonClick={() => setErrorMessage("")}
        />
      ) : null}
      {!errorMessage && !isConnected && missingTarget ? (
        <InlineNotification
          kind="info"
          lowContrast
          title={t("liveView.noticeTitle", "Live view 尚不可用")}
          subtitle={helperText}
          hideCloseButton
        />
      ) : null}

      <div className={styles.preview}>
        {busy ? (
          <div className={styles.loading}>
            <SkeletonPlaceholder style={{ width: "100%", height: 220 }} />
            <div className={styles.loadingLabel}>
              {t("action.loading", "連線中…")}
            </div>
          </div>
        ) : null}
        <video
          ref={videoRef}
          className={styles.video}
          autoPlay
          playsInline
          muted
          controls={isConnected && !busy}
        />
        {!busy && !isConnected ? (
          <div className={styles.emptyState}>
            {helperText}
          </div>
        ) : null}
      </div>

      <div className={styles.actions}>
        <Button
          renderIcon={isConnected ? Renew : View}
          onClick={startLiveView}
          disabled={!canStart}
          kind="primary"
          size="md"
        >
          {isConnected
            ? t("liveView.resubscribe", "重新連線")
            : t("liveView.subscribe", "連線即時監看")}
        </Button>
        <Button
          kind="ghost"
          renderIcon={StopFilledAlt}
          onClick={stopLiveView}
          disabled={busy || !isConnected}
          size="md"
        >
          {t("liveView.stop", "停止")}
        </Button>
      </div>
    </Tile>
  );
};

export default ExamLiveViewPanel;
