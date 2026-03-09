import { useState, useMemo, useEffect, useCallback } from "react";
import { Tag, InlineLoading } from "@carbon/react";
import { ChevronDown, ChevronUp } from "@carbon/icons-react";
import { useTranslation, type TFunction } from "react-i18next";
import { useParams } from "react-router-dom";
import type { EventFeedItem } from "@/core/entities/contest.entity";
import { PRIORITY_LABELS, PRIORITY_TAG_COLOR } from "@/features/contest/constants/eventTaxonomy";
import { fetchScreenshots, type ScreenshotFrame } from "@/infrastructure/api/repositories/exam.repository";
import styles from "./IncidentCard.module.scss";

type TFn = TFunction<"contest", undefined>;

// Keys already surfaced elsewhere in the card or that are pure noise
const HIDDEN_META_KEYS = new Set([
  "reason", "source", "phase", "event_idempotency_key", "ts",
  // orchestrator internals — already reflected in incident priority & penalized flag
  "decision", "priority", "severity", "dedupe_hit", "reason_code",
  // opaque session ID — not actionable for admins
  "upload_session_id",
  // forced_capture_* are summarised as a group
  "forced_capture_requested", "forced_capture_reason", "forced_capture_result",
  "forced_capture_attempted", "forced_capture_captured", "forced_capture_uploaded",
  "forced_capture_skipped", "forced_capture_error_code", "forced_capture_seq",
]);

const META_LABEL_KEYS: Record<string, string> = {
  existing_device_id: "logs.meta.existingDeviceId",
  incoming_device_id: "logs.meta.incomingDeviceId",
  approved_by: "logs.meta.approvedBy",
  locked_at: "logs.meta.lockedAt",
  lock_reason: "logs.meta.lockReason",
  retry_count: "logs.meta.retryCount",
};

interface CaptureInfo {
  result: string;
  hasError: boolean;
  errorCode?: string;
  seq?: number;
}

function parseCaptureInfo(meta: Record<string, unknown>): CaptureInfo | null {
  if (!meta.forced_capture_requested) return null;
  const result = String(meta.forced_capture_result ?? "unknown");
  const hasError = !!meta.forced_capture_error_code;
  return {
    result,
    hasError,
    errorCode: hasError ? String(meta.forced_capture_error_code) : undefined,
    seq: typeof meta.forced_capture_seq === "number" ? meta.forced_capture_seq : undefined,
  };
}

interface IncidentCardProps {
  incident: EventFeedItem;
}

export default function IncidentCard({ incident }: IncidentCardProps) {
  const { t } = useTranslation("contest");
  const { contestId } = useParams<{ contestId: string }>();
  const [expanded, setExpanded] = useState(false);

  const priorityLabel = PRIORITY_LABELS[incident.priority] ?? "P3";
  const tagColor = PRIORITY_TAG_COLOR[incident.priority] ?? "cool-gray";

  const firstTime = new Date(incident.firstAt).toLocaleTimeString();
  const lastTime = new Date(incident.lastAt).toLocaleTimeString();
  const timeRange = incident.count > 1 ? `${firstTime} — ${lastTime}` : firstTime;

  const meta = incident.metadata ?? {};

  const captureInfo = useMemo(() => parseCaptureInfo(meta), [meta]);

  const meaningfulEntries = useMemo(() => {
    return Object.entries(meta)
      .filter(([k]) => !HIDDEN_META_KEYS.has(k))
      .map(([k, v]) => ({
        key: k,
        label: META_LABEL_KEYS[k] ? t(META_LABEL_KEYS[k], k) : k,
        value: formatMetaValue(k, v, t),
      }));
  }, [meta]);

  const hasEvidence = incident.evidenceCount > 0;
  const hasDetail = !!(
    incident.summary ||
    meaningfulEntries.length > 0 ||
    captureInfo ||
    hasEvidence ||
    incident.count > 1
  );

  // --- Screenshot lazy loading ---
  const [screenshots, setScreenshots] = useState<ScreenshotFrame[]>([]);
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const [screenshotError, setScreenshotError] = useState(false);
  const [screenshotLoaded, setScreenshotLoaded] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const loadScreenshots = useCallback(async () => {
    if (!contestId || !incident.userId || screenshotLoaded) return;
    setScreenshotLoading(true);
    setScreenshotError(false);
    try {
      const firstMs = new Date(incident.firstAt).getTime();
      const lastMs = new Date(incident.lastAt).getTime();
      // Widen window by ±5s to catch nearby frames
      const margin = 5_000;
      const result = await fetchScreenshots(contestId, {
        user_id: String(incident.userId),
        ts_from: firstMs - margin,
        ts_to: lastMs + margin,
        limit: 10,
      });
      setScreenshots(result.items);
      setScreenshotLoaded(true);
    } catch {
      setScreenshotError(true);
    } finally {
      setScreenshotLoading(false);
    }
  }, [contestId, incident.userId, incident.firstAt, incident.lastAt, screenshotLoaded]);

  useEffect(() => {
    if (expanded && hasEvidence && !screenshotLoaded && !screenshotLoading) {
      void loadScreenshots();
    }
  }, [expanded, hasEvidence, screenshotLoaded, screenshotLoading, loadScreenshots]);

  return (
    <>
      <div
        className={`${styles.card} ${styles[`priority${incident.priority}`] ?? ""} ${expanded ? styles.cardExpanded : ""}`}
      >
        <div
          className={styles.header}
          onClick={() => hasDetail && setExpanded((v) => !v)}
          role={hasDetail ? "button" : undefined}
          tabIndex={hasDetail ? 0 : undefined}
        >
          <div className={styles.left}>
            <Tag type={tagColor} size="sm">{priorityLabel}</Tag>
            <span className={styles.eventType}>
              {t(`logs.eventTypes.${incident.eventType}`, incident.eventType)}
            </span>
            {incident.userName && (
              <span className={styles.userName}>{incident.userName}</span>
            )}
          </div>
          <div className={styles.right}>
            <div className={styles.badges}>
              {incident.penalized && (
                <Tag type="red" size="sm">{t("logs.penalized", "計罰")}</Tag>
              )}
              {incident.count > 1 && (
                <Tag type="outline" size="sm">×{incident.count}</Tag>
              )}
              {incident.evidenceCount > 0 && (
                <Tag type="teal" size="sm">
                  {t("logs.evidenceCount", "{{count}} 截圖", { count: incident.evidenceCount })}
                </Tag>
              )}
            </div>
            <span className={styles.time}>{timeRange}</span>
            {hasDetail && (
              <span className={styles.chevron}>
                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </span>
            )}
          </div>
        </div>

        {expanded && (
          <div className={styles.detail}>
            {incident.summary && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>{t("logs.detail.reason", "原因")}</span>
                <span className={styles.detailValue}>{incident.summary}</span>
              </div>
            )}
            {incident.count > 1 && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>{t("logs.detail.timeRange", "時間範圍")}</span>
                <span className={styles.detailValue}>
                  {new Date(incident.firstAt).toLocaleString()} — {new Date(incident.lastAt).toLocaleString()}
                </span>
              </div>
            )}
            {incident.penalized && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>{t("logs.detail.penalized", "計罰")}</span>
                <Tag type="red" size="sm">{t("common.yes", "是")}</Tag>
              </div>
            )}

            {/* Forced capture summary */}
            {captureInfo && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>{t("logs.detail.captureStatus", "截圖狀態")}</span>
                <span className={styles.detailValue}>
                  <CaptureStatusTag info={captureInfo} t={t} />
                </span>
              </div>
            )}

            {/* Screenshot thumbnails */}
            {hasEvidence && (
              <div className={styles.screenshotSection}>
                <span className={styles.detailLabel}>{t("logs.detail.evidence", "截圖證據")}</span>
                {screenshotLoading && (
                  <InlineLoading description={t("logs.detail.loadingScreenshots", "載入截圖中…")} />
                )}
                {screenshotError && (
                  <span className={styles.screenshotError}>
                    {t("logs.detail.screenshotLoadFailed", "截圖載入失敗")}
                  </span>
                )}
                {screenshots.length > 0 && (
                  <div className={styles.screenshotGrid}>
                    {screenshots.map((frame) => (
                      <button
                        key={frame.seq}
                        className={styles.screenshotThumb}
                        onClick={() => setLightboxUrl(frame.url)}
                        title={new Date(frame.ts_ms).toLocaleTimeString()}
                      >
                        <img src={frame.url} alt={`seq ${frame.seq}`} loading="lazy" />
                        <span className={styles.screenshotTime}>
                          {new Date(frame.ts_ms).toLocaleTimeString()}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {screenshotLoaded && screenshots.length === 0 && !screenshotError && (
                  <span className={styles.screenshotEmpty}>
                    {t("logs.detail.noScreenshots", "原始截圖已清除或轉檔為影片")}
                  </span>
                )}
              </div>
            )}

            {/* Meaningful metadata entries */}
            {meaningfulEntries.length > 0 && (
              <div className={styles.metaSection}>
                {meaningfulEntries.map(({ key, label, value }) => (
                  <div key={key} className={styles.detailRow}>
                    <span className={styles.detailLabel}>{label}</span>
                    <span className={styles.detailValue}>{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lightbox overlay */}
      {lightboxUrl && (
        <div className={styles.lightbox} onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="screenshot" />
        </div>
      )}
    </>
  );
}

/** Render capture result as a colored tag */
function CaptureStatusTag({ info, t }: { info: CaptureInfo; t: TFn }) {
  if (info.result === "uploaded") {
    return <Tag type="green" size="sm">{t("logs.capture.uploaded", "Uploaded")}{info.seq != null ? ` #${info.seq}` : ""}</Tag>;
  }
  if (info.result === "captured") {
    return <Tag type="blue" size="sm">{t("logs.capture.capturedNotUploaded", "Captured (not uploaded)")}</Tag>;
  }
  if (info.result.startsWith("skipped:")) {
    const reason = info.result.replace("skipped:", "");
    const skipLabelKeys: Record<string, string> = {
      disabled: "logs.capture.skipDisabled",
      cooldown: "logs.capture.skipCooldown",
      stream_unavailable: "logs.capture.skipStreamUnavailable",
      capture_unavailable: "logs.capture.skipCaptureUnavailable",
    };
    const label = skipLabelKeys[reason] ? t(skipLabelKeys[reason], reason) : reason;
    return <Tag type="cool-gray" size="sm">{t("logs.capture.skipped", "Skipped")}: {label}</Tag>;
  }
  if (info.hasError) {
    return <Tag type="red" size="sm">{t("logs.capture.failed", "Failed")}: {info.errorCode}</Tag>;
  }
  return <Tag type="cool-gray" size="sm">{info.result}</Tag>;
}

function formatMetaValue(key: string, value: unknown, t: TFn): string {
  if (key === "locked_at" && typeof value === "string") {
    try { return new Date(value).toLocaleString(); } catch { /* fall through */ }
  }
  if (typeof value === "boolean") return value ? t("common.yes", "Yes") : t("common.no", "No");
  return String(value);
}
