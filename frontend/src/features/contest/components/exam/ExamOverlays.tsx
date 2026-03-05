import React from "react";
import { Button } from "@carbon/react";
import { Locked } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import ExamCountdownOverlay from "./ExamCountdownOverlay";
import styles from "./ExamOverlays.module.scss";

interface ExamOverlaysProps {
  showGracePeriod: boolean;
  gracePeriodCountdown: number;
  showLockScreen: boolean;
  lockReason?: string;
  timeLeft: string | null;
  onBackToContest: () => void;
}

export const ExamOverlays: React.FC<ExamOverlaysProps> = ({
  showGracePeriod,
  gracePeriodCountdown,
  showLockScreen,
  lockReason,
  timeLeft,
  onBackToContest,
}) => {
  const { t } = useTranslation("contest");

  return (
    <>
      {showGracePeriod && (
        <ExamCountdownOverlay
          value={gracePeriodCountdown}
          title={t("exam.modeEnabled")}
          message={t("exam.antiCheatStarting")}
          hint={t("exam.doNotSwitchTabs")}
        />
      )}

      {showLockScreen && (
        <div className={styles.lockBackdrop}>
          <div className={styles.lockPanel}>
            <div className={styles.lockHeader}>
              <div className={styles.lockIconWrap}>
                <Locked size={28} className={styles.lockIcon} />
              </div>
              <div>
                <h1 className={styles.lockTitle}>{t("exam.answerLocked")}</h1>
                <p className={styles.lockReason}>
                  {lockReason || t("exam.lockedReason")}
                </p>
              </div>
            </div>

            {timeLeft ? (
              <section className={styles.countdownSection}>
                <p className={styles.countdownLabel}>{t("exam.autoUnlockCountdown")}</p>
                <p className={styles.countdownValue}>{timeLeft}</p>
              </section>
            ) : (
              <section className={styles.noticeSection}>
                <p className={styles.noticeText}>{t("exam.contactProctorToUnlock")}</p>
              </section>
            )}

            <p className={styles.violationText}>{t("exam.violationRecorded")}</p>

            <div className={styles.actionSection}>
              <Button kind="primary" onClick={onBackToContest}>
                {t("exam.backToDashboard")}
              </Button>
              <p className={styles.actionHint}>{t("exam.canViewButNoAnswer")}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
