import { createElement } from "react";
import { useTranslation } from "react-i18next";
import type { EventFeedItem } from "@/core/entities/contest.entity";
import {
  getEventTypeIcon,
  getEventTypeLabel,
} from "@/features/contest/constants/eventTaxonomy";
import { formatContestClockTime } from "@/features/contest/utils/contestTimeFormat";
import styles from "./EventIncidentCard.module.scss";

interface EventIncidentCardProps {
  incident: EventFeedItem;
  selected?: boolean;
  onSelect?: (incident: EventFeedItem) => void;
}

export default function EventIncidentCard({
  incident,
  selected = false,
  onSelect,
}: EventIncidentCardProps) {
  const { t } = useTranslation("contest");
  const eventIcon = createElement(getEventTypeIcon(incident.eventType, incident.priority), { size: 18 });
  const eventLabel = getEventTypeLabel(t, incident.eventType);
  const timeLabel = formatContestClockTime(incident.lastAt || incident.firstAt, "zh-Hant-TW", {
    hour12: false,
    timeZone: "Asia/Taipei",
  });
  const primaryMeta = [
    incident.userName,
    timeLabel,
  ].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      className={[
        styles.card,
        selected ? styles.selected : "",
        styles[`priority${incident.priority}`] ?? "",
      ].filter(Boolean).join(" ")}
      aria-pressed={selected}
      onClick={() => onSelect?.(incident)}
    >
      <span className={styles.topRow}>
        <span className={styles.eventIcon} aria-hidden="true">
          {eventIcon}
        </span>
        <span className={styles.eventType}>{eventLabel}</span>
      </span>
      <span className={styles.metaRow}>
        {primaryMeta ? <span>{primaryMeta}</span> : null}
        {incident.count > 1 ? <span>×{incident.count}</span> : null}
        {incident.evidenceCount > 0 ? (
          <span>
            {t("logs.evidenceCompact", {
              defaultValue: "證據 {{count}}",
              count: incident.evidenceCount,
            })}
          </span>
        ) : null}
      </span>
    </button>
  );
}
