import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";

import type { EventFeedItem } from "@/core/entities/contest.entity";
import EventIncidentCard from "@/features/contest/components/admin/EventIncidentCard";
import IncidentDetail from "@/features/contest/components/admin/IncidentDetail";

import styles from "./ProctorLiveStage.module.scss";

const PANEL_TRANSITION = {
  duration: 0.22,
  ease: [0.2, 0, 0.38, 0.9] as const,
};

export interface ParticipantEventTimelineProps {
  events: EventFeedItem[];
  loading: boolean;
  error: string;
  selectedKey: string;
  selectedIncident: EventFeedItem | null;
  contestId: string;
  detailOpen: boolean;
  reducedMotion: boolean;
  /** Hide the 事件 title when a surrounding tab already names it. */
  hideHeader?: boolean;
  onSelect: (event: EventFeedItem) => void;
  onCloseDetail: () => void;
}

const ParticipantEventTimeline = ({
  events,
  loading,
  error,
  selectedKey,
  selectedIncident,
  contestId,
  detailOpen,
  reducedMotion,
  hideHeader = false,
  onSelect,
  onCloseDetail,
}: ParticipantEventTimelineProps) => {
  const { t } = useTranslation("contest");

  return (
    <aside className={styles.eventsPane}>
      {hideHeader ? null : (
        <div className={styles.eventsHeader}>
          <span>{t("proctoringPanel.events", "事件")}</span>
          {loading ? <span className={styles.eventsLoading}>{t("action.loading", "連線中...")}</span> : null}
        </div>
      )}
      {error ? <div className={styles.eventsError}>{error}</div> : null}
      <div className={styles.eventsList}>
        {events.length === 0 && !loading ? (
          <div className={styles.eventsEmpty}>{t("proctoringPanel.noEvents", "目前沒有事件")}</div>
        ) : null}
        {events.map((event) => {
          const selected = event.incidentKey === selectedKey;
          return (
            <EventIncidentCard
              key={event.incidentKey}
              incident={event}
              selected={selected}
              onSelect={onSelect}
            />
          );
        })}
      </div>
      <AnimatePresence initial={false}>
        {detailOpen && selectedIncident ? (
          <motion.div
            key={selectedIncident.incidentKey}
            className={styles.eventDetailDrawer}
            initial={reducedMotion ? { opacity: 1, x: 0 } : { opacity: 0, x: 32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reducedMotion ? { opacity: 1, x: 0 } : { opacity: 0, x: 32 }}
            transition={reducedMotion ? { duration: 0 } : PANEL_TRANSITION}
          >
            <IncidentDetail
              contestId={contestId}
              incident={selectedIncident}
              showHeader
              showMetadata={false}
              onClose={onCloseDetail}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </aside>
  );
};

export default ParticipantEventTimeline;
