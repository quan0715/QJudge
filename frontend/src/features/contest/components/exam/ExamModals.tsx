import React from "react";
import { Modal } from "@carbon/react";
import { CheckmarkFilled, ScreenOff, VideoOff, FitToScreen } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { ModalAlertContent } from "./ModalAlertContent";
import styles from "./ModalAlertContent.module.scss";

interface ExamModalsProps {
  showUnlockNotification: boolean;
  onUnlockContinue: () => void;
  recoverySource?: string | null;
  onRecoverFullscreen?: () => void;
  showScreenShareRecovery?: boolean;
  isRequestingScreenShare?: boolean;
  onScreenShareReacquire?: () => void;
  showWebcamRecovery?: boolean;
  isRequestingWebcam?: boolean;
  onWebcamReacquire?: () => void;
  showViewportRecovery?: boolean;
  isTablet?: boolean;
}

export const ExamModals: React.FC<ExamModalsProps> = ({
  showUnlockNotification,
  onUnlockContinue,
  recoverySource,
  onRecoverFullscreen,
  showScreenShareRecovery = false,
  isRequestingScreenShare = false,
  onScreenShareReacquire,
  showWebcamRecovery = false,
  isRequestingWebcam = false,
  onWebcamReacquire,
  showViewportRecovery = false,
  isTablet = false,
}) => {
  const { t } = useTranslation("contest");
  const withButtonTestId = (testId: string, label: React.ReactNode) => (
    <span data-testid={testId}>{label}</span>
  );

  return (
    <>
      {/* Local sensor warning; the Worker is the only policy authority. */}
      <Modal
        data-testid="exam-recovery-modal"
        open={recoverySource != null}
        modalHeading={
          recoverySource === "multiple_displays"
            ? t("exam.multiDisplayRecoveryTitle", "偵測到多螢幕")
            : recoverySource === "mouse_leave"
            ? t("exam.mouseLeaveRecoveryTitle")
            : t("exam.fullscreenRecoveryTitle")
        }
        primaryButtonText={withButtonTestId(
          "exam-recovery-confirm-btn",
          recoverySource === "fullscreen"
            ? t("exam.returnToFullscreen")
            : t("exam.iUnderstand")
        )}
        primaryButtonDisabled={recoverySource !== "fullscreen"}
        onRequestSubmit={recoverySource === "fullscreen" ? onRecoverFullscreen : undefined}
        onRequestClose={recoverySource === "fullscreen" ? onRecoverFullscreen : undefined}
        preventCloseOnClickOutside
        danger
        size="sm"
      >
        <div className={styles.recoveryWrapper}>
          <p className={styles.recoveryText}>
            {recoverySource === "multiple_displays"
              ? t("exam.multiDisplaySensorWarning", "偵測到多螢幕，請回到單一顯示器。")
              : recoverySource === "mouse_leave"
                ? t("exam.mouseLeaveSensorWarning", "偵測到游標離開考試視窗，請回到考試頁面。")
                : t("exam.fullscreenSensorWarning", "請回到全螢幕模式繼續作答。")}
          </p>
          <p className={styles.recoveryHint}>{t("exam.stayInExamPage")}</p>
        </div>
      </Modal>

      {/* Unlock Notification Modal */}
      <Modal
        data-testid="exam-unlock-modal"
        open={showUnlockNotification}
        modalHeading={t("exam.unlocked")}
        primaryButtonText={withButtonTestId("exam-unlock-continue-btn", t("exam.continueExam"))}
        onRequestSubmit={onUnlockContinue}
        onRequestClose={onUnlockContinue}
        preventCloseOnClickOutside
        size="sm"
      >
        <ModalAlertContent
          icon={<CheckmarkFilled size={40} style={{ color: "var(--cds-support-success)" }} />}
          variant="success"
          title={t("exam.examUnlockedTitle")}
          description={t("exam.examUnlockedDesc")}
          descriptionPrimary
        >
          <div className={styles.infoBox} style={{ textAlign: "left" }}>
            <p className={styles.infoBoxText}>{t("exam.followRulesReminder")}</p>
          </div>
        </ModalAlertContent>
      </Modal>

      {/* Screen Share Recovery Modal */}
      <Modal
        data-testid="exam-screen-share-modal"
        open={showScreenShareRecovery}
        modalHeading={t("exam.screenShareLostTitle")}
        primaryButtonText={withButtonTestId(
          "exam-screen-share-reshare-btn",
          isRequestingScreenShare
            ? t("exam.requestingScreenShare")
            : t("exam.reshareScreen")
        )}
        primaryButtonDisabled={isRequestingScreenShare}
        onRequestSubmit={onScreenShareReacquire}
        preventCloseOnClickOutside
        danger
        size="sm"
      >
        <ModalAlertContent
          icon={<ScreenOff size={40} style={{ color: "var(--cds-support-error)" }} />}
          variant="error"
          title={t("exam.screenShareLostHeading")}
          description={t("exam.screenShareLostDesc")}
        >
          <div className={styles.warningBox}>
            <p className={styles.warningBoxText}>
              {t("exam.screenShareSensorWarning", "請重新分享螢幕以恢復監考來源。")}
            </p>
          </div>
        </ModalAlertContent>
      </Modal>

      {/* Webcam Recovery Modal */}
      <Modal
        data-testid="exam-webcam-recovery-modal"
        open={showWebcamRecovery}
        modalHeading={t("exam.webcamLostTitle", "Webcam 連線中斷")}
        primaryButtonText={withButtonTestId(
          "exam-webcam-recovery-btn",
          isRequestingWebcam
            ? t("exam.requestingWebcam", "正在請求 Webcam…")
            : t("exam.reauthorizeWebcam", "重新授權 Webcam")
        )}
        primaryButtonDisabled={isRequestingWebcam}
        onRequestSubmit={onWebcamReacquire}
        preventCloseOnClickOutside
        danger
        size="sm"
      >
        <ModalAlertContent
          icon={<VideoOff size={40} style={{ color: "var(--cds-support-error)" }} />}
          variant="error"
          title={t("exam.webcamLostHeading", "Webcam 已停止運作")}
          description={t("exam.webcamLostDesc", "系統偵測到 Webcam 連線中斷，請確認攝影機未被其他程式佔用。")}
        >
          <div className={styles.warningBox}>
            <p className={styles.warningBoxText}>
              {t("exam.webcamSensorWarning", "請重新授權 Webcam 以恢復監考來源。")}
            </p>
          </div>
        </ModalAlertContent>
      </Modal>

      {/* Viewport / Split View Recovery Modal */}
      <Modal
        data-testid="exam-viewport-recovery-modal"
        open={showViewportRecovery}
        modalHeading={
          isTablet
            ? t("exam.splitViewDetectedTitle", "偵測到分割畫面")
            : t("exam.viewportInterruptedTitle", "視窗大小異常")
        }
        primaryButtonText={withButtonTestId(
          "exam-viewport-recovery-btn",
          t("exam.iUnderstand")
        )}
        onRequestSubmit={() => {}}
        preventCloseOnClickOutside
        danger
        size="sm"
      >
        <ModalAlertContent
          icon={<FitToScreen size={40} style={{ color: "var(--cds-support-error)" }} />}
          variant="error"
          title={
            isTablet
              ? t("exam.splitViewDetectedHeading", "請關閉 Split View / Slide Over")
              : t("exam.viewportInterruptedHeading", "請恢復考試視窗大小")
          }
          description={
            isTablet
              ? t("exam.splitViewDetectedDesc", "考試期間不允許使用分割畫面或 Slide Over，請關閉後繼續作答。")
              : t("exam.viewportInterruptedDesc", "系統偵測到視窗大小或縮放異常，請恢復原始大小。")
          }
        >
          <div className={styles.warningBox}>
            <p className={styles.warningBoxText}>
              {t("exam.viewportSensorWarning", "請恢復原始視窗大小或關閉分割畫面。")}
            </p>
          </div>
        </ModalAlertContent>
      </Modal>

    </>
  );
};
