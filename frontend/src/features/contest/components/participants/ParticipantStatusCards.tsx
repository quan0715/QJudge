import { DocumentTasks, Login, Time, UserMultiple, View, WarningAlt } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";

import type { ParticipantDashboard } from "@/core/entities/contest.entity";
import { getParticipantKpis, getParticipantLiveSignals, type ParticipantKpi, type ParticipantLiveSignal } from "./participantKpis";
import styles from "./ParticipantStatusCards.module.scss";

interface ParticipantStatusCardsProps {
  dashboard: ParticipantDashboard;
  showViolations: boolean;
}

type IconComponent = typeof Time;

// Same icons as the former participant drawer.
const LIVE_ICONS: Record<ParticipantLiveSignal["key"], IconComponent> = {
  connection: Login,
  live: View,
  screen: View,
  webcam: UserMultiple,
};

const KPI_ICONS: Record<ParticipantKpi["key"], IconComponent> = {
  time: Time,
  score: DocumentTasks,
  accuracy: UserMultiple,
  progress: DocumentTasks,
  violations: WarningAlt,
};

export default function ParticipantStatusCards({ dashboard, showViolations }: ParticipantStatusCardsProps) {
  const { t } = useTranslation("contest");
  const kpis = getParticipantKpis(dashboard, { showViolations, t });
  const liveSignals = getParticipantLiveSignals(dashboard.participant, t);

  return (
    <div className={styles.cards}>
      <section className={styles.statusSection}>
        <h3 className={styles.statusTitle}>{t("dashboard.liveStatus", "即時狀態")}</h3>
        <div className={styles.statusList}>
          {liveSignals.map((signal) => {
            const Icon = LIVE_ICONS[signal.key];
            return (
              <div key={signal.key} className={styles.statusRow}>
                <div className={styles.statusIcon}>
                  <Icon size={16} />
                </div>
                <div className={styles.statusText}>
                  <span>{signal.label}</span>
                  <span className={styles.statusValueRow}>
                    <span
                      aria-hidden="true"
                      className={`${styles.statusDot} ${signal.tone === "success" ? styles.statusDotLive : ""}`}
                    />
                    <strong className={signal.tone === "success" ? styles.statusSuccess : styles.statusMuted}>
                      {signal.value}
                    </strong>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className={styles.statusSection}>
        <h3 className={styles.statusTitle}>{t("dashboard.examStatus", "考試狀態")}</h3>
        <div className={styles.statusList}>
          {kpis.map((kpi) => {
            const Icon = KPI_ICONS[kpi.key];
            return (
              <div key={kpi.key} className={styles.statusRow}>
                <div className={styles.statusIcon}>
                  <Icon size={16} />
                </div>
                <div className={styles.statusText}>
                  <span>{kpi.label}</span>
                  <strong className={kpi.tone === "danger" ? styles.statusDanger : undefined}>{kpi.value}</strong>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
