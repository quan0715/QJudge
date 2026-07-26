import { createElement, useEffect, useMemo, useState } from "react";
import { Button, Tag } from "@carbon/react";
import { Close } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { EventFeedItem } from "@/core/entities/contest.entity";
import { getEventTypeIcon, getEventTypeLabel } from "@/features/contest/constants/eventTaxonomy";
import {
  formatContestClockTime,
  formatContestDateTime,
} from "@/features/contest/utils/contestTimeFormat";
import IntegrityEvidenceReview from "./IntegrityEvidenceReview";
import styles from "./IncidentDetail.module.scss";

const HIDDEN_META_KEYS = new Set([
  "reason",
  "source",
  "content",
  "integrity",
  "incident_id",
  "incident_status",
  "transitions",
  "integrity_evidence_status",
  "integrity_evidence_sources",
  "occurrences",
]);

type IncidentOccurrence = {
  incidentId: string;
  eventId: string;
  firstAt: string;
  lastAt: string;
  durationMs: number;
  hasEvidence: boolean;
};

const getOccurrences = (meta: Record<string, unknown>): IncidentOccurrence[] => {
  if (!Array.isArray(meta.occurrences)) return [];
  return meta.occurrences.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    if (
      typeof item.incident_id !== "string" ||
      typeof item.event_id !== "string" ||
      typeof item.first_at !== "string" ||
      typeof item.last_at !== "string"
    ) return [];
    return [{
      incidentId: item.incident_id,
      eventId: item.event_id,
      firstAt: item.first_at,
      lastAt: item.last_at,
      durationMs: typeof item.duration_ms === "number" ? item.duration_ms : 0,
      hasEvidence: item.has_evidence === true,
    }];
  });
};

const META_LABEL_KEYS: Record<string, string> = {
  existing_device_id: "logs.meta.existingDeviceId",
  incoming_device_id: "logs.meta.incomingDeviceId",
  approved_by: "logs.meta.approvedBy",
  locked_at: "logs.meta.lockedAt",
  lock_reason: "logs.meta.lockReason",
  retry_count: "logs.meta.retryCount",
};

const isHiddenMetaKey = (key: string) =>
  HIDDEN_META_KEYS.has(key);

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
  if (typeof meta.content !== "string" && typeof meta.action !== "string") {
    return null;
  }
  return [{
    id: String(meta.action || "clipboard"),
    content: typeof meta.content === "string" ? meta.content : "",
    action: typeof meta.action === "string" ? meta.action : "clipboard",
    truncated: meta.content_truncated === true,
    originalLength: typeof meta.original_text_length === "number" ? meta.original_text_length : null,
    capturedLength: typeof meta.captured_text_length === "number" ? meta.captured_text_length : null,
    textLength: typeof meta.text_length === "number" ? meta.text_length : null,
    lineCount: typeof meta.line_count === "number" ? meta.line_count : null,
  }];
};

interface IncidentDetailProps {
  incident: EventFeedItem;
  contestId?: string;
  showHeader?: boolean;
  showMetadata?: boolean;
  onClose?: () => void;
}

export default function IncidentDetail({
  incident,
  contestId,
  showHeader = false,
  showMetadata = true,
  onClose,
}: IncidentDetailProps) {
  const { t } = useTranslation("contest");
  const [selectedOccurrenceIndex, setSelectedOccurrenceIndex] = useState(0);

  const meta = useMemo(() => incident.metadata ?? {}, [incident.metadata]);
  const occurrences = useMemo(() => getOccurrences(meta), [meta]);
  useEffect(() => setSelectedOccurrenceIndex(0), [incident.incidentKey]);
  const selectedOccurrence = occurrences[selectedOccurrenceIndex];
  const eventContent = useMemo(() => getEventContent(meta), [meta]);
  const incidentStatus = typeof meta.incident_status === "string" ? meta.incident_status : null;
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
        {incident.firstAt !== incident.lastAt ? (
          <div className={styles.row}>
            <span className={styles.label}>{t("logs.detail.timeRange", "時間範圍")}</span>
            <span className={styles.value}>
              {formatContestDateTime(incident.firstAt)} — {formatContestDateTime(incident.lastAt)}
            </span>
          </div>
        ) : null}
        {incidentStatus ? (
          <div className={styles.row}>
            <span className={styles.label}>{t("logs.detail.incidentStatus", "事件狀態")}</span>
            <Tag type={incidentStatus === "restored" ? "green" : "warm-gray"} size="sm">
              {incidentStatus}
            </Tag>
          </div>
        ) : null}
        {incident.penalized ? (
          <div className={styles.row}>
            <span className={styles.label}>{t("logs.detail.penalized", "計罰")}</span>
            <Tag type="red" size="sm">{t("common.yes", "是")}</Tag>
          </div>
        ) : null}
        {occurrences.length > 1 ? (
          <section className={styles.occurrenceSection}>
            <span className={styles.sectionLabel}>
              {t("logs.occurrences", "事件次序")}
            </span>
            <div className={styles.occurrenceList}>
              {occurrences.map((occurrence, index) => (
                <Button
                  key={occurrence.incidentId}
                  kind={index === selectedOccurrenceIndex ? "secondary" : "ghost"}
                  size="sm"
                  aria-pressed={index === selectedOccurrenceIndex}
                  onClick={() => setSelectedOccurrenceIndex(index)}
                >
                  {t("logs.occurrenceLabel", {
                    defaultValue: "第 {{index}} 次 · {{time}} · {{seconds}} 秒",
                    index: index + 1,
                    time: formatContestClockTime(occurrence.firstAt, undefined, {
                      includeSeconds: true,
                    }),
                    seconds: (occurrence.durationMs / 1000).toFixed(1),
                  })}
                  {occurrence.hasEvidence ? ` · ${t("logs.evidenceAvailable", "有證據")}` : ""}
                </Button>
              ))}
            </div>
          </section>
        ) : null}
        <IntegrityEvidenceReview
          contestId={contestId}
          eventId={selectedOccurrence?.eventId ?? incident.eventId}
          occurredAt={selectedOccurrence?.firstAt ?? incident.firstAt}
        />

        {eventContent ? (
          <section className={styles.eventContentSection}>
            <div className={styles.eventContentHeader}>
              <span className={styles.sectionLabel}>{t("logs.detail.eventContent", "事件內容")}</span>
              <span className={styles.eventContentMeta}>
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

    </div>
  );
}
