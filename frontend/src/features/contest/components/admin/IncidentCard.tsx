import { useState, useMemo, useEffect, useCallback } from "react";
import { Tag, InlineLoading } from "@carbon/react";
import { ChevronDown, ChevronUp, Close } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import type { EventFeedItem } from "@/core/entities/contest.entity";
import {
  getEventTypeIcon,
  getEventTypeLabel,
} from "@/features/contest/constants/eventTaxonomy";
import {
  buildIncidentScreenshotQuery,
  getIncidentEvidenceModules,
  getIncidentEvidenceObjectKeys,
  INCIDENT_EVIDENCE_SOURCE_LABELS,
  isIncidentEvidenceSource,
  type IncidentEvidenceSource,
} from "@/features/contest/components/admin/incidentEvidence";
import {
  fetchScreenshots,
  type ScreenshotFrame,
} from "@/infrastructure/api/repositories/exam.repository";
import styles from "./IncidentCard.module.scss";

// Keys already surfaced elsewhere in the card or that are pure noise
const HIDDEN_META_KEYS = new Set([
  "reason",
  "source",
  "phase",
  "event_idempotency_key",
  "ts",
  // rendered as the dedicated event content block
  "content",
  "clipboard_actions",
  "event_id",
  // orchestrator internals — already reflected in incident priority & penalized flag
  "decision",
  "priority",
  "severity",
  "dedupe_hit",
  "reason_code",
  // opaque session ID — not actionable for admins
  "upload_session_id",
  // forced_capture_* are summarised as a group
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

function formatMetaValue(key: string, value: unknown): string {
  if (key === "locked_at" && typeof value === "string") {
    try {
      return new Date(value).toLocaleString();
    } catch {
      /* fall through */
    }
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function getEventContent(meta: Record<string, unknown>) {
  if (Array.isArray(meta.clipboard_actions)) {
    const entries = meta.clipboard_actions
      .filter(
        (item): item is Record<string, unknown> =>
          !!item && typeof item === "object" && !Array.isArray(item),
      )
      .map((item, index) => ({
        id: `${String(item.action || "clipboard")}-${index}`,
        content: typeof item.content === "string" ? item.content : "",
        action: typeof item.action === "string" ? item.action : "",
        truncated: item.content_truncated === true,
        originalLength:
          typeof item.original_text_length === "number"
            ? item.original_text_length
            : null,
        capturedLength:
          typeof item.captured_text_length === "number"
            ? item.captured_text_length
            : null,
        textLength:
          typeof item.text_length === "number" ? item.text_length : null,
        lineCount: typeof item.line_count === "number" ? item.line_count : null,
      }));
    return entries.length > 0 ? entries : null;
  }
  if (typeof meta.content !== "string" || meta.content.length === 0)
    return null;
  return [
    {
      id: "content-0",
      content: meta.content,
      action: typeof meta.action === "string" ? meta.action : "",
      truncated: meta.content_truncated === true,
      originalLength:
        typeof meta.original_text_length === "number"
          ? meta.original_text_length
          : null,
      capturedLength:
        typeof meta.captured_text_length === "number"
          ? meta.captured_text_length
          : null,
      textLength:
        typeof meta.text_length === "number" ? meta.text_length : null,
      lineCount: typeof meta.line_count === "number" ? meta.line_count : null,
    },
  ];
}

interface IncidentCardProps {
  incident: EventFeedItem;
  screenshotWindowBeforeMs?: number;
  screenshotWindowAfterMs?: number;
  screenshotPreviewLimit?: number;
  screenshotCategories?: string[];
  initialExpanded?: boolean;
  collapsible?: boolean;
}

export default function IncidentCard({
  incident,
  screenshotWindowBeforeMs = 20_000,
  screenshotWindowAfterMs = 20_000,
  screenshotPreviewLimit = 10,
  screenshotCategories = ["critical", "violation"],
  initialExpanded = false,
  collapsible = true,
}: IncidentCardProps) {
  const { t } = useTranslation("contest");
  const { contestId } = useParams<{ contestId: string }>();
  const [expanded, setExpanded] = useState(initialExpanded || !collapsible);

  const EventIcon = getEventTypeIcon(incident.eventType, incident.priority);
  const eventTypeLabel = useMemo(
    () => getEventTypeLabel(t, incident.eventType),
    [incident.eventType, t],
  );

  const firstTime = new Date(incident.firstAt).toLocaleTimeString();
  const lastTime = new Date(incident.lastAt).toLocaleTimeString();
  const timeRange =
    incident.count > 1 ? `${firstTime} — ${lastTime}` : firstTime;

  const meta = useMemo(() => incident.metadata ?? {}, [incident.metadata]);

  const evidenceObjectKeys = useMemo(() => getIncidentEvidenceObjectKeys(meta), [meta]);
  const evidenceModules = useMemo(
    () => getIncidentEvidenceModules(meta, evidenceObjectKeys),
    [meta, evidenceObjectKeys],
  );
  const eventContent = useMemo(() => getEventContent(meta), [meta]);

  // --- Screenshot lazy loading ---
  const [screenshots, setScreenshots] = useState<ScreenshotFrame[]>([]);
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const [screenshotError, setScreenshotError] = useState(false);
  const [screenshotLoaded, setScreenshotLoaded] = useState(false);
  const [totalRawCount, setTotalRawCount] = useState(0);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const screenshotsByModule = useMemo(() => {
    return screenshots.reduce<Partial<Record<IncidentEvidenceSource, ScreenshotFrame[]>>>(
      (acc, frame) => {
        const module = isIncidentEvidenceSource(frame.source_module)
          ? frame.source_module
          : "screen_share";
        acc[module] = [...(acc[module] ?? []), frame];
        return acc;
      },
      {},
    );
  }, [screenshots]);

  const meaningfulEntries = useMemo(() => {
    return Object.entries(meta)
      .filter(([k, v]) => !isHiddenMetaKey(k) && isDisplayableMetaValue(v))
      .map(([k, v]) => ({
        key: k,
        label: META_LABEL_KEYS[k]
          ? String(t(META_LABEL_KEYS[k], { defaultValue: k }))
          : k,
        value: formatMetaValue(k, v),
      }));
  }, [meta, t]);

  const hasEvidence = incident.evidenceCount > 0;
  const suspiciousCategories = useMemo(
    () => new Set(screenshotCategories.map((v) => v.toLowerCase())),
    [screenshotCategories],
  );
  const shouldAttemptScreenshotPreview =
    hasEvidence ||
    suspiciousCategories.has(String(incident.category || "").toLowerCase());
  const hasDetail = !!(
    incident.summary ||
    eventContent ||
    meaningfulEntries.length > 0 ||
    shouldAttemptScreenshotPreview ||
    incident.count > 1
  );
  const canToggle = collapsible && hasDetail;

  const loadScreenshots = useCallback(async () => {
    if (!contestId || !incident.userId || screenshotLoaded) return;
    setScreenshotLoading(true);
    setScreenshotError(false);
    try {
      const params = buildIncidentScreenshotQuery(incident, {
        userId: String(incident.userId),
        windowBeforeMs: screenshotWindowBeforeMs,
        windowAfterMs: screenshotWindowAfterMs,
        fallbackLimit: screenshotPreviewLimit,
      });
      const result = await fetchScreenshots(contestId, params);

      setScreenshots(result.items);
      setTotalRawCount(result.total_raw_count);
      setScreenshotLoaded(true);
    } catch {
      setScreenshotError(true);
    } finally {
      setScreenshotLoading(false);
    }
  }, [
    contestId,
    incident,
    screenshotLoaded,
    screenshotPreviewLimit,
    screenshotWindowBeforeMs,
    screenshotWindowAfterMs,
  ]);

  useEffect(() => {
    if (
      expanded &&
      shouldAttemptScreenshotPreview &&
      !screenshotLoaded &&
      !screenshotLoading
    ) {
      void loadScreenshots();
    }
  }, [
    expanded,
    shouldAttemptScreenshotPreview,
    screenshotLoaded,
    screenshotLoading,
    loadScreenshots,
  ]);

  useEffect(() => {
    if (!lightboxUrl) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxUrl(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxUrl]);

  return (
    <>
      <div
        className={`${styles.card} ${styles[`priority${incident.priority}`] ?? ""} ${expanded ? styles.cardExpanded : ""}`}
      >
        <div
          className={`${styles.header} ${canToggle ? styles.headerButton : ""}`}
          onClick={() => canToggle && setExpanded((v) => !v)}
          onKeyDown={(event) => {
            if (!canToggle) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setExpanded((v) => !v);
            }
          }}
          role={canToggle ? "button" : undefined}
          tabIndex={canToggle ? 0 : undefined}
          aria-expanded={canToggle ? expanded : undefined}
        >
          <div className={styles.left}>
            <span
              className={styles.priorityIcon}
              aria-label={eventTypeLabel}
              title={eventTypeLabel}
            >
              <EventIcon size={16} />
            </span>
            <span className={styles.eventType}>
              {eventTypeLabel}
            </span>
            {incident.userName && (
              <span className={styles.userName}>{incident.userName}</span>
            )}
          </div>
          <div className={styles.right}>
            <div className={styles.badges}>
              {incident.penalized && (
                <Tag type="red" size="sm">
                  {t("logs.penalized", "計罰")}
                </Tag>
              )}
              {incident.count > 1 && (
                <Tag type="outline" size="sm">
                  ×{incident.count}
                </Tag>
              )}
              {incident.evidenceCount > 0 && (
                <Tag type="teal" size="sm">
                  {t("logs.evidenceCount", "{{count}} 截圖", {
                    count: incident.evidenceCount,
                  })}
                </Tag>
              )}
            </div>
            <span className={styles.time}>{timeRange}</span>
            {canToggle && (
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
                <span className={styles.detailLabel}>
                  {t("logs.detail.reason", "原因")}
                </span>
                <span className={styles.detailValue}>{incident.summary}</span>
              </div>
            )}
            {incident.count > 1 && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>
                  {t("logs.detail.timeRange", "時間範圍")}
                </span>
                <span className={styles.detailValue}>
                  {new Date(incident.firstAt).toLocaleString()} —{" "}
                  {new Date(incident.lastAt).toLocaleString()}
                </span>
              </div>
            )}
            {incident.penalized && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>
                  {t("logs.detail.penalized", "計罰")}
                </span>
                <Tag type="red" size="sm">
                  {t("common.yes", "是")}
                </Tag>
              </div>
            )}

            {evidenceModules.length > 0 && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>
                  {t("logs.detail.evidenceSources", "證據來源")}
                </span>
                <span className={styles.sourceList}>
                  {evidenceModules.map((module) => (
                    <Tag
                      key={module}
                      type={module === "webcam" ? "purple" : "cyan"}
                      size="sm"
                    >
                      {INCIDENT_EVIDENCE_SOURCE_LABELS[module]}
                    </Tag>
                  ))}
                </span>
              </div>
            )}

            {/* Screenshot thumbnails */}
            {shouldAttemptScreenshotPreview && (
              <div className={styles.screenshotSection}>
                <span className={styles.detailLabel}>
                  {t("logs.detail.evidence", "截圖證據")}
                </span>
                {screenshotLoading && (
                  <InlineLoading
                    description={String(
                      t("logs.detail.loadingScreenshots", "載入截圖中…"),
                    )}
                  />
                )}
                {screenshotError && (
                  <span className={styles.screenshotError}>
                    {t("logs.detail.screenshotLoadFailed", "截圖載入失敗")}
                  </span>
                )}
                {screenshots.length > 0 && (
                  <div className={styles.screenshotGroups}>
                    {(Object.keys(screenshotsByModule) as IncidentEvidenceSource[]).map(
                      (module) => (
                        <div key={module} className={styles.screenshotGroup}>
                          <div className={styles.screenshotSourceHeader}>
                            <Tag
                              type={module === "webcam" ? "purple" : "cyan"}
                              size="sm"
                            >
                              {INCIDENT_EVIDENCE_SOURCE_LABELS[module]}
                            </Tag>
                            <span>
                              {screenshotsByModule[module]?.length ?? 0}
                            </span>
                          </div>
                          <div className={styles.screenshotGrid}>
                            {(screenshotsByModule[module] ?? []).map(
                              (frame) => (
                                <button
                                  key={`${frame.source_module ?? "unknown"}_${frame.ts_ms}_${frame.seq}`}
                                  className={styles.screenshotThumb}
                                  onClick={() => setLightboxUrl(frame.url)}
                                  title={new Date(
                                    frame.ts_ms,
                                  ).toLocaleTimeString()}
                                >
                                  <img
                                    src={frame.url}
                                    alt={`${module} seq ${frame.seq}`}
                                    loading="lazy"
                                  />
                                  <span className={styles.screenshotTime}>
                                    {new Date(frame.ts_ms).toLocaleTimeString()}
                                  </span>
                                </button>
                              ),
                            )}
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                )}
                {screenshotLoaded &&
                  screenshots.length === 0 &&
                  !screenshotError && (
                    <span className={styles.screenshotEmpty}>
                      {totalRawCount > 0
                        ? t("logs.detail.noScreenshotsInRange", {
                            defaultValue:
                              "此事件前後時段無截圖，該使用者共有 {{count}} 張原始截圖",
                            count: totalRawCount,
                          })
                        : t(
                            "logs.detail.noScreenshots",
                            "此事件前後時段無可用原始截圖，建議改看即時監看",
                          )}
                    </span>
                  )}
              </div>
            )}

            {eventContent && (
              <div className={styles.eventContentSection}>
                <div className={styles.eventContentHeader}>
                  <span className={styles.detailLabel}>
                    {t("logs.detail.eventContent", "事件內容")}
                  </span>
                  <span className={styles.eventContentMeta}>
                    {eventContent.length > 1
                      ? t("logs.detail.clipboardActionLabel", {
                          defaultValue: "{{count}} 筆剪貼簿操作",
                          count: eventContent.length,
                        })
                      : null}
                    {eventContent.some((entry) => entry.truncated)
                      ? t("logs.detail.contentTruncated", {
                          defaultValue: "部分內容已截斷",
                        })
                      : null}
                  </span>
                </div>
                <div className={styles.eventContentList}>
                  {eventContent.map((entry) => (
                    <div key={entry.id} className={styles.eventContentItem}>
                      <div className={styles.eventContentItemHeader}>
                        <Tag
                          type={entry.action === "paste" ? "teal" : "cool-gray"}
                          size="sm"
                        >
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
                          {entry.truncated &&
                          entry.originalLength != null &&
                          entry.capturedLength != null
                            ? t("logs.detail.contentTruncated", {
                                defaultValue:
                                  "已截斷：{{captured}} / {{original}} 字",
                                captured: entry.capturedLength,
                                original: entry.originalLength,
                              })
                            : null}
                        </span>
                      </div>
                      {entry.content ? (
                        <pre className={styles.eventContentValue}>
                          {entry.content}
                        </pre>
                      ) : (
                        <span className={styles.eventContentEmpty}>
                          {t(
                            "logs.detail.noClipboardContent",
                            "此操作未保存內容",
                          )}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
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
        <div
          className={styles.lightbox}
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxUrl(null)}
          aria-label={t("logs.detail.lightboxLabel", "截圖預覽")}
        >
          <button
            type="button"
            className={styles.lightboxClose}
            onClick={(event) => {
              event.stopPropagation();
              setLightboxUrl(null);
            }}
            aria-label={t("common.close", "關閉")}
          >
            <Close size={20} />
          </button>
          <img src={lightboxUrl} alt="screenshot" />
        </div>
      )}
    </>
  );
}
