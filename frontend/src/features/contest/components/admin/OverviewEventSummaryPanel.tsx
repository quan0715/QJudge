import { Tile } from "@carbon/react";
import {
  Chat,
  Time,
  Warning,
  WarningAlt,
} from "@carbon/icons-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ExamEvent } from "@/core/entities/contest.entity";
import { getEventPriority } from "@/features/contest/constants/eventTaxonomy";
import styles from "./OverviewEventSummaryPanel.module.scss";

interface OverviewEventSummaryPanelProps {
  examEvents: ExamEvent[];
}

const RECENT_LIST_SIZE = 6;
const RECENT_WINDOW_MS = 30 * 60 * 1000;
const EVENT_UNIT_KEY = "adminOverview.events.unit";
const EVENT_UNIT_FALLBACK = "件";

export default function OverviewEventSummaryPanel({
  examEvents,
}: OverviewEventSummaryPanelProps) {
  const { t } = useTranslation("contest");

  const summary = useMemo(() => {
    const events = examEvents.filter((event) => event.eventType !== "heartbeat");
    let latestEventTs = Number.NEGATIVE_INFINITY;
    for (const event of events) {
      const ts = new Date(event.timestamp).getTime();
      if (Number.isFinite(ts)) {
        latestEventTs = Math.max(latestEventTs, ts);
      }
    }

    let criticalCount = 0;
    let violationCount = 0;
    let qaCount = 0;
    let recentWindowCount = 0;

    for (const event of events) {
      const priority = getEventPriority(event.eventType);
      if (priority === 0) criticalCount += 1;
      if (priority === 1) violationCount += 1;
      if (event.eventType === "ask_question" || event.eventType === "reply_question") {
        qaCount += 1;
      }
      const ts = new Date(event.timestamp).getTime();
      if (
        Number.isFinite(ts) &&
        Number.isFinite(latestEventTs) &&
        latestEventTs - ts <= RECENT_WINDOW_MS
      ) {
        recentWindowCount += 1;
      }
    }

    return {
      criticalCount,
      violationCount,
      qaCount,
      recentWindowCount,
      recentEvents: events.slice(0, RECENT_LIST_SIZE),
    };
  }, [examEvents]);

  return (
    <section className={styles.section}>
      <h3 className={styles.title}>
        {t("adminOverview.events.title", "事件摘要")}
      </h3>

      <div className={styles.statsGrid}>
        {[
          {
            key: "critical",
            label: t("adminOverview.events.critical", "高風險事件"),
            count: summary.criticalCount,
            icon: WarningAlt,
            color: "var(--cds-support-error)",
          },
          {
            key: "violations",
            label: t("adminOverview.events.violations", "違規事件"),
            count: summary.violationCount,
            icon: Warning,
            color: "var(--cds-support-warning)",
          },
          {
            key: "qa",
            label: t("adminOverview.events.qa", "問答互動"),
            count: summary.qaCount,
            icon: Chat,
            color: "var(--cds-support-info)",
          },
          {
            key: "recent",
            label: t("adminOverview.events.recent30m", "近 30 分鐘"),
            count: summary.recentWindowCount,
            icon: Time,
            color: "var(--cds-link-primary)",
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Tile key={item.key} className={styles.statTile}>
              <div className={styles.statLabelRow}>
                <Icon size={16} className={styles.statIcon} style={{ color: item.color }} />
                <span className={styles.statLabel}>{item.label}</span>
              </div>
              <div className={styles.statValueRow}>
                <span className={styles.statValue}>{item.count}</span>
                <span className={styles.statUnit}>
                  {t(EVENT_UNIT_KEY, EVENT_UNIT_FALLBACK)}
                </span>
              </div>
            </Tile>
          );
        })}
      </div>

      <Tile className={styles.listTile}>
        <div className={styles.listHeader}>
          {t("adminOverview.events.recentList", "最近事件")}
        </div>
        {summary.recentEvents.length === 0 ? (
          <div className={styles.emptyText}>
            {t("adminOverview.events.empty", "目前沒有事件")}
          </div>
        ) : (
          <ul className={styles.eventList}>
            {summary.recentEvents.map((event) => (
              <li key={`${event.id}-${event.timestamp}`} className={styles.eventItem}>
                <span className={styles.eventTime}>
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
                <span className={styles.eventType}>
                  {t(`logs.eventTypes.${event.eventType}`, event.eventType)}
                </span>
                <span className={styles.eventUser}>{event.userName || "-"}</span>
              </li>
            ))}
          </ul>
        )}
      </Tile>
    </section>
  );
}
