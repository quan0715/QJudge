import { createElement, useCallback, useEffect, useMemo, useState } from "react";
import { Button, InlineLoading, Tag } from "@carbon/react";
import { Close } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { EventFeedItem } from "@/core/entities/contest.entity";
import { getEventTypeIcon, getEventTypeLabel } from "@/features/contest/constants/eventTaxonomy";
import {
  buildIncidentScreenshotQuery,
  getIncidentEvidenceModules,
  getIncidentEvidenceObjectKeys,
  INCIDENT_EVIDENCE_SOURCE_LABELS,
  isAttendanceEvidenceIncident,
  isIncidentEvidenceSource,
  shouldFetchIncidentScreenshots,
  type IncidentEvidenceSource,
} from "@/features/contest/components/admin/incidentEvidence";
import {
  fetchScreenshots,
  type ScreenshotFrame,
} from "@/infrastructure/api/repositories/exam.repository";
import {
  formatContestClockTime,
  formatContestDateTime,
} from "@/features/contest/utils/contestTimeFormat";
import { ImageViewer, type ImageViewerItem } from "@/shared/ui/image";
import styles from "./IncidentDetail.module.scss";

const HIDDEN_META_KEYS = new Set([
  "reason",
  "source",
  "phase",
  "event_idempotency_key",
  "ts",
  "content",
  "clipboard_actions",
  "event_id",
  "decision",
  "priority",
  "severity",
  "dedupe_hit",
  "reason_code",
  "upload_session_id",
  "forced_capture_requested",
  "forced_capture_reason",
  "forced_capture_result",
  "forced_capture_attempted",
  "forced_capture_captured",
  "forced_capture_uploaded",
  "forced_capture_skipped",
  "forced_capture_error_code",
  "forced_capture_seq",
  "forced_capture_uploaded_seqs",
  "forced_capture_uploaded_object_keys",
  "evidence_pre_buffer_attempted",
  "evidence_pre_buffer_complete",
  "evidence_pre_buffer_frame_count",
  "evidence_uploaded_frame_count",
  "pre_buffer_complete",
  "evidence_cluster_id",
  "evidence_window_start",
  "evidence_window_end",
  "evidence_window_before_seconds",
  "evidence_window_after_seconds",
  "evidence_window_max_seconds",
  "evidence_source_module",
  "forced_capture_modules",
  "forced_capture_module_results",
  "module",
  "module_role",
  "evidence_mode",
  "incident_family",
  "incident_family_dup",
  "evidence_anchor_at",
  "evidence_anchor_at_ms",
  "client_observed_at",
  "client_observed_at_ms",
  "server_observed_at",
  "anchor_window",
  "anchor_event",
  "anchor_event_id",
]);

const META_LABEL_KEYS: Record<string, string> = {
  existing_device_id: "logs.meta.existingDeviceId",
  incoming_device_id: "logs.meta.incomingDeviceId",
  approved_by: "logs.meta.approvedBy",
  locked_at: "logs.meta.lockedAt",
  lock_reason: "logs.meta.lockReason",
  retry_count: "logs.meta.retryCount",
};

const EVIDENCE_SOURCE_ORDER: IncidentEvidenceSource[] = ["screen_share", "webcam", "attendance"];

const getFrameSource = (frame: ScreenshotFrame): IncidentEvidenceSource =>
  isIncidentEvidenceSource(frame.source_module) ? frame.source_module : "screen_share";

const getFrameKey = (source: IncidentEvidenceSource, frame: ScreenshotFrame, index: number) =>
  `${source}-${frame.evidence_frame_id ?? "raw"}-${frame.ts_ms}-${frame.seq}-${index}`;

const isHiddenMetaKey = (key: string) =>
  HIDDEN_META_KEYS.has(key) ||
  key.includes("anchor") ||
  key.startsWith("forced_capture_") ||
  key.startsWith("evidence_window_") ||
  key.startsWith("evidence_pre_buffer_") ||
  key.startsWith("client_observed_") ||
  key.startsWith("incident_family");

const isDisplayableMetaValue = (value: unknown) =>
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

const formatMetaValue = (key: string, value: unknown): string => {
  if (key === "locked_at" && typeof value === "string") {
    return formatContestDateTime(value) || value;
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
};

const getEventContent = (meta: Record<string, unknown>) => {
  const rawItems = Array.isArray(meta.clipboard_actions)
    ? meta.clipboard_actions
    : typeof meta.content === "string" || typeof meta.action === "string"
      ? [meta]
      : [];

  const entries = rawItems
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item))
    .map((item, index) => ({
      id: `${String(item.action || "clipboard")}-${index}`,
      content: typeof item.content === "string" ? item.content : "",
      action: typeof item.action === "string" ? item.action : "clipboard",
      truncated: item.content_truncated === true,
      originalLength: typeof item.original_text_length === "number" ? item.original_text_length : null,
      capturedLength: typeof item.captured_text_length === "number" ? item.captured_text_length : null,
      textLength: typeof item.text_length === "number" ? item.text_length : null,
      lineCount: typeof item.line_count === "number" ? item.line_count : null,
    }));
  return entries.length > 0 ? entries : null;
};

interface IncidentDetailProps {
  incident: EventFeedItem;
  contestId?: string;
  userId?: string;
  evidenceLayout?: "list" | "grid";
  showHeader?: boolean;
  showMetadata?: boolean;
  onClose?: () => void;
  screenshotWindowBeforeMs?: number;
  screenshotWindowAfterMs?: number;
  screenshotPreviewLimit?: number;
}

export default function IncidentDetail({
  incident,
  contestId,
  userId,
  evidenceLayout = "list",
  showHeader = false,
  showMetadata = true,
  onClose,
  screenshotWindowBeforeMs = 20_000,
  screenshotWindowAfterMs = 20_000,
  screenshotPreviewLimit = 10,
}: IncidentDetailProps) {
  const { t } = useTranslation("contest");
  const [frames, setFrames] = useState<ScreenshotFrame[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [totalRawCount, setTotalRawCount] = useState(0);
  const [imageViewerIndex, setImageViewerIndex] = useState<number | null>(null);

  const meta = useMemo(() => incident.metadata ?? {}, [incident.metadata]);
  const evidenceObjectKeys = useMemo(() => getIncidentEvidenceObjectKeys(meta), [meta]);
  const evidenceModules = useMemo(
    () => getIncidentEvidenceModules(meta, evidenceObjectKeys),
    [evidenceObjectKeys, meta],
  );
  const eventContent = useMemo(() => getEventContent(meta), [meta]);
  const canFetchEvidence = shouldFetchIncidentScreenshots(incident);
  const isAttendanceEvidence = isAttendanceEvidenceIncident(incident);
  const eventLabel = useMemo(
    () => getEventTypeLabel(t, incident.eventType),
    [incident.eventType, t],
  );
  const eventIcon = useMemo(() => {
    const Icon = getEventTypeIcon(incident.eventType, incident.priority);
    return createElement(Icon, { size: 18 });
  }, [incident.eventType, incident.priority]);

  const meaningfulEntries = useMemo(() => {
    if (!showMetadata) return [];
    return Object.entries(meta)
      .filter(([key, value]) => !isHiddenMetaKey(key) && isDisplayableMetaValue(value))
      .map(([key, value]) => ({
        key,
        label: META_LABEL_KEYS[key]
          ? String(t(META_LABEL_KEYS[key], { defaultValue: key }))
          : key,
        value: formatMetaValue(key, value),
      }));
  }, [meta, showMetadata, t]);

  const loadEvidence = useCallback(async () => {
    if (!contestId || !userId || !canFetchEvidence || loaded) return;
    setLoading(true);
    setError(false);
    try {
      const result = await fetchScreenshots(
        contestId,
        buildIncidentScreenshotQuery(incident, {
          userId,
          windowBeforeMs: screenshotWindowBeforeMs,
          windowAfterMs: screenshotWindowAfterMs,
          fallbackLimit: screenshotPreviewLimit,
        }),
      );
      setFrames(result.items);
      setTotalRawCount(result.total_raw_count);
      setLoaded(true);
    } catch {
      setFrames([]);
      setError(true);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [
    canFetchEvidence,
    contestId,
    incident,
    loaded,
    screenshotPreviewLimit,
    screenshotWindowAfterMs,
    screenshotWindowBeforeMs,
    userId,
  ]);

  useEffect(() => {
    setFrames([]);
    setLoaded(false);
    setError(false);
    setTotalRawCount(0);
    setImageViewerIndex(null);
  }, [incident.incidentKey]);

  useEffect(() => {
    if (!loaded && !loading) void loadEvidence();
  }, [loadEvidence, loaded, loading]);

  const framesByModule = useMemo(() => {
    return frames.reduce<Partial<Record<IncidentEvidenceSource, ScreenshotFrame[]>>>((acc, frame) => {
      const module = getFrameSource(frame);
      acc[module] = [...(acc[module] ?? []), frame];
      return acc;
    }, {});
  }, [frames]);

  const images = useMemo<ImageViewerItem[]>(
    () =>
      frames.map((frame) => {
        const module = getFrameSource(frame);
        const label = `${INCIDENT_EVIDENCE_SOURCE_LABELS[module]} · ${formatContestClockTime(
          frame.ts_ms,
          undefined,
          { includeSeconds: true },
        )}`;
        return { url: frame.url, alt: label, label };
      }),
    [frames],
  );

  const hasClipboardContent = !!eventContent?.length;

  return (
    <div className={styles.detail}>
      {showHeader ? (
        <div className={styles.header}>
          <div className={styles.title}>
            {eventIcon}
            <span>{eventLabel}</span>
          </div>
          <div className={styles.headerActions}>
            <span className={styles.time}>
              {formatContestClockTime(incident.lastAt, undefined, { includeSeconds: true })}
            </span>
            {onClose ? (
              <Button
                kind="ghost"
                size="sm"
                hasIconOnly
                renderIcon={Close}
                iconDescription={t("button.close", "關閉")}
                onClick={onClose}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      <div className={styles.body}>
        {incident.summary ? (
          <div className={styles.row}>
            <span className={styles.label}>{t("logs.detail.reason", "原因")}</span>
            <span className={styles.value}>{incident.summary}</span>
          </div>
        ) : null}
        {incident.count > 1 ? (
          <div className={styles.row}>
            <span className={styles.label}>{t("logs.detail.timeRange", "時間範圍")}</span>
            <span className={styles.value}>
              {formatContestDateTime(incident.firstAt)} — {formatContestDateTime(incident.lastAt)}
            </span>
          </div>
        ) : null}
        {incident.penalized ? (
          <div className={styles.row}>
            <span className={styles.label}>{t("logs.detail.penalized", "計罰")}</span>
            <Tag type="red" size="sm">{t("common.yes", "是")}</Tag>
          </div>
        ) : null}
        {evidenceModules.length > 0 ? (
          <div className={styles.row}>
            <span className={styles.label}>{t("logs.detail.evidenceSources", "證據來源")}</span>
            <span className={styles.sourceList}>
              {evidenceModules.map((module) => (
                <Tag key={module} type={module === "webcam" ? "purple" : module === "attendance" ? "green" : "cyan"} size="sm">
                  {INCIDENT_EVIDENCE_SOURCE_LABELS[module]}
                </Tag>
              ))}
            </span>
          </div>
        ) : null}

        {canFetchEvidence ? (
          <section className={styles.evidenceSection}>
            <div className={styles.sectionLabel}>
              {isAttendanceEvidence
                ? t("logs.detail.attendanceEvidence", "簽到照片")
                : t("logs.detail.evidence", "截圖證據")}
            </div>
            {loading ? (
              <InlineLoading description={String(t("logs.detail.loadingScreenshots", "載入截圖中…"))} />
            ) : null}
            {error ? (
              <span className={styles.error}>{t("logs.detail.screenshotLoadFailed", "截圖載入失敗")}</span>
            ) : null}
            {frames.length > 0 ? (
              <div className={styles.groups}>
                {EVIDENCE_SOURCE_ORDER.map((source) => {
                  const sourceFrames = framesByModule[source] ?? [];
                  if (sourceFrames.length === 0) return null;
                  return (
                    <div key={source} className={styles.group}>
                      <div className={styles.groupHeader}>{INCIDENT_EVIDENCE_SOURCE_LABELS[source]}</div>
                      <div className={evidenceLayout === "grid" ? styles.frameGrid : styles.frameList}>
                        {sourceFrames.map((frame, index) => (
                          <button
                            key={getFrameKey(source, frame, index)}
                            type="button"
                            className={styles.frame}
                            onClick={() => setImageViewerIndex(Math.max(0, frames.indexOf(frame)))}
                          >
                            <img src={frame.url} alt={`${source} seq ${frame.seq}`} loading="lazy" />
                            <span>
                              {formatContestClockTime(frame.ts_ms, undefined, { includeSeconds: true })}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {loaded && frames.length === 0 && !error && !hasClipboardContent ? (
              <span className={styles.empty}>
                {isAttendanceEvidence
                  ? t("logs.detail.noAttendanceEvidence", "尚無可用簽到照片")
                  : totalRawCount > 0
                    ? t("logs.detail.noScreenshotsInRange", {
                        defaultValue: "此事件前後時段無截圖，該使用者共有 {{count}} 張原始截圖",
                        count: totalRawCount,
                      })
                    : t("logs.detail.noScreenshots", "此事件前後時段無可用原始截圖，建議改看即時監看")}
              </span>
            ) : null}
          </section>
        ) : null}

        {eventContent ? (
          <section className={styles.eventContentSection}>
            <div className={styles.eventContentHeader}>
              <span className={styles.sectionLabel}>{t("logs.detail.eventContent", "事件內容")}</span>
              <span className={styles.eventContentMeta}>
                {eventContent.length > 1
                  ? t("logs.detail.clipboardActionLabel", {
                      defaultValue: "{{count}} 筆剪貼簿操作",
                      count: eventContent.length,
                    })
                  : null}
                {eventContent.some((entry) => entry.truncated)
                  ? t("logs.detail.contentTruncated", { defaultValue: "部分內容已截斷" })
                  : null}
              </span>
            </div>
            <div className={styles.eventContentList}>
              {eventContent.map((entry) => (
                <div key={entry.id} className={styles.eventContentItem}>
                  <div className={styles.eventContentItemHeader}>
                    <Tag type={entry.action === "paste" ? "teal" : "cool-gray"} size="sm">
                      {entry.action || "clipboard"}
                    </Tag>
                    <span className={styles.eventContentMeta}>
                      {entry.textLength != null
                        ? t("logs.detail.clipboardTextLength", {
                            defaultValue: "{{count}} 字",
                            count: entry.textLength,
                          })
                        : null}
                      {entry.lineCount != null
                        ? t("logs.detail.clipboardLineCount", {
                            defaultValue: "{{count}} 行",
                            count: entry.lineCount,
                          })
                        : null}
                      {entry.truncated && entry.originalLength != null && entry.capturedLength != null
                        ? t("logs.detail.contentTruncated", {
                            defaultValue: "已截斷：{{captured}} / {{original}} 字",
                            captured: entry.capturedLength,
                            original: entry.originalLength,
                          })
                        : null}
                    </span>
                  </div>
                  {entry.content ? (
                    <pre className={styles.eventContentValue}>{entry.content}</pre>
                  ) : (
                    <span className={styles.eventContentEmpty}>
                      {t("logs.detail.noClipboardContent", "此操作未保存內容")}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {meaningfulEntries.length > 0 ? (
          <section className={styles.metaSection}>
            {meaningfulEntries.map(({ key, label, value }) => (
              <div key={key} className={styles.row}>
                <span className={styles.label}>{label}</span>
                <span className={styles.value}>{value}</span>
              </div>
            ))}
          </section>
        ) : null}
      </div>

      {imageViewerIndex != null ? (
        <ImageViewer
          images={images}
          index={imageViewerIndex}
          onIndexChange={setImageViewerIndex}
          onClose={() => setImageViewerIndex(null)}
          closeLabel={String(t("common.close", "關閉"))}
          previousLabel={String(t("logs.detail.previousScreenshot", "上一張截圖"))}
          nextLabel={String(t("logs.detail.nextScreenshot", "下一張截圖"))}
        />
      ) : null}
    </div>
  );
}
