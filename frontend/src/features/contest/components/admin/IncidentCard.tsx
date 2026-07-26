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
import { formatContestClockTime } from "@/features/contest/utils/contestTimeFormat";
import IncidentDetail from "./IncidentDetail";
import styles from "./IncidentCard.module.scss";

interface IncidentCardProps {
  incident: EventFeedItem;
  initialExpanded?: boolean;
  collapsible?: boolean;
}

export default function IncidentCard({
  incident,
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
  const firstTime = formatContestClockTime(incident.firstAt, undefined, {
    includeSeconds: true,
  });
  const lastTime = formatContestClockTime(incident.lastAt, undefined, {
    includeSeconds: true,
  });
  const timeRange = incident.firstAt !== incident.lastAt
    ? `${firstTime} — ${lastTime}`
    : firstTime;
  const shouldShowEvidence = incident.source === "exam_event" && !!incident.eventId;
  const hasDetail = !!(
    incident.summary ||
    shouldShowEvidence ||
    incident.firstAt !== incident.lastAt ||
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
            {incident.hasEvidence ? (
              <Tag type="teal" size="sm">
                {t("logs.evidenceAvailable", "有證據")}
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
          />
        </div>
      ) : null}
    </div>
  );
}
