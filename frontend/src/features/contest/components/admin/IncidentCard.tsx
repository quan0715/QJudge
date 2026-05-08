import { createElement, useMemo, useState } from "react";
import { Tag } from "@carbon/react";
import { ChevronDown, ChevronUp } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import type { EventFeedItem } from "@/core/entities/contest.entity";
import {
  getEventTypeIcon,
  getEventTypeLabel,
} from "@/features/contest/constants/eventTaxonomy";
import { shouldFetchIncidentScreenshots } from "@/features/contest/components/admin/incidentEvidence";
import IncidentDetail from "./IncidentDetail";
import styles from "./IncidentCard.module.scss";

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

  const eventIcon = createElement(
    getEventTypeIcon(incident.eventType, incident.priority),
    { size: 16 },
  );
  const eventTypeLabel = useMemo(
    () => getEventTypeLabel(t, incident.eventType),
    [incident.eventType, t],
  );
  const firstTime = new Date(incident.firstAt).toLocaleTimeString();
  const lastTime = new Date(incident.lastAt).toLocaleTimeString();
  const timeRange = incident.count > 1 ? `${firstTime} — ${lastTime}` : firstTime;
  const suspiciousCategories = useMemo(
    () => new Set(screenshotCategories.map((value) => value.toLowerCase())),
    [screenshotCategories],
  );
  const shouldShowEvidence =
    shouldFetchIncidentScreenshots(incident) &&
    (incident.evidenceCount > 0 ||
      suspiciousCategories.has(String(incident.category || "").toLowerCase()));
  const hasDetail = !!(
    incident.summary ||
    shouldShowEvidence ||
    incident.count > 1 ||
    incident.penalized
  );
  const canToggle = collapsible && hasDetail;

  return (
    <div
      className={`${styles.card} ${styles[`priority${incident.priority}`] ?? ""} ${expanded ? styles.cardExpanded : ""}`}
    >
      <div
        className={`${styles.header} ${canToggle ? styles.headerButton : ""}`}
        onClick={() => canToggle && setExpanded((value) => !value)}
        onKeyDown={(event) => {
          if (!canToggle) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setExpanded((value) => !value);
          }
        }}
        role={canToggle ? "button" : undefined}
        tabIndex={canToggle ? 0 : undefined}
        aria-expanded={canToggle ? expanded : undefined}
      >
        <div className={styles.left}>
          <span className={styles.priorityIcon} aria-label={eventTypeLabel} title={eventTypeLabel}>
            {eventIcon}
          </span>
          <span className={styles.eventType}>{eventTypeLabel}</span>
          {incident.userName ? <span className={styles.userName}>{incident.userName}</span> : null}
        </div>
        <div className={styles.right}>
          <div className={styles.badges}>
            {incident.penalized ? (
              <Tag type="red" size="sm">
                {t("logs.penalized", "計罰")}
              </Tag>
            ) : null}
            {incident.count > 1 ? (
              <Tag type="outline" size="sm">
                ×{incident.count}
              </Tag>
            ) : null}
            {incident.evidenceCount > 0 ? (
              <Tag type="teal" size="sm">
                {t("logs.evidenceCount", "{{count}} 截圖", {
                  count: incident.evidenceCount,
                })}
              </Tag>
            ) : null}
          </div>
          <span className={styles.time}>{timeRange}</span>
          {canToggle ? (
            <span className={styles.chevron}>
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </span>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div className={styles.detail}>
          <IncidentDetail
            incident={incident}
            contestId={contestId}
            userId={incident.userId}
            evidenceLayout="grid"
            screenshotWindowBeforeMs={screenshotWindowBeforeMs}
            screenshotWindowAfterMs={screenshotWindowAfterMs}
            screenshotPreviewLimit={screenshotPreviewLimit}
          />
        </div>
      ) : null}
    </div>
  );
}
