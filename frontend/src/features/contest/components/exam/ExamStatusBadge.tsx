import type { ExamStatusType } from "@/core/entities/contest.entity";
import { View, Locked, WarningAltFilled } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import styles from "../layout/ContestLayout.module.scss";

interface ExamStatusBadgeProps {
  examStatus?: ExamStatusType;
  cheatDetectionEnabled?: boolean;
  timeLeft?: string | null;
  unlockTimeLeft?: string | null;
  lockReason?: string;
  autoUnlockAt?: string | null;
  onClick?: () => void;
}

const ExamStatusBadge: React.FC<ExamStatusBadgeProps> = ({
  examStatus,
  cheatDetectionEnabled,
  timeLeft,
  unlockTimeLeft,
  lockReason,
  autoUnlockAt,
  onClick,
}) => {
  const { t } = useTranslation("contest");

  if (!cheatDetectionEnabled) return null;

  if (examStatus === "locked" || examStatus === "locked_takeover") {
    const title = `${lockReason || t("exam.lockedReason")}${
      autoUnlockAt
        ? `\n${t("exam.expectedUnlock")}: ${new Date(autoUnlockAt).toLocaleTimeString()}`
        : `\n${t("exam.contactProctor")}`
    }`;
    return (
      <div title={title} className={styles.examStatusLocked}>
        <Locked size={16} />
        <span>{t("exam.locked")}</span>
        {unlockTimeLeft && (
          <span className={styles.examTimeDisplay}>{unlockTimeLeft}</span>
        )}
      </div>
    );
  }

  if (examStatus === "paused") {
    return (
      <div title={t("exam.pausedHint")} className={styles.examStatusPaused}>
        <WarningAltFilled size={16} />
        <span>{t("exam.paused")}</span>
      </div>
    );
  }

  if (examStatus === "in_progress") {
    return (
      <div
        title={t("exam.monitoringHint")}
        onClick={onClick}
        className={styles.examStatusInProgress}
      >
        <View size={16} />
        <span>{t("exam.monitoring")}</span>
        {timeLeft && <span className={styles.examTimeDisplay}>{timeLeft}</span>}
      </div>
    );
  }

  return null;
};

export default ExamStatusBadge;
