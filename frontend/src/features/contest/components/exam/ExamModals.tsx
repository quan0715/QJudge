import React from "react";
import { Modal } from "@carbon/react";
import { WarningAlt, CheckmarkFilled, ScreenOff, DocumentExport, VideoOff, FitToScreen } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ExamModeState } from "@/core/entities/contest.entity";
import { ModalAlertContent } from "./ModalAlertContent";
import styles from "./ModalAlertContent.module.scss";

interface ExamModalsProps {
  showWarning: boolean;
  pendingApiResponse: boolean;
  lastApiResponse: { locked?: boolean; isLocked?: boolean } | null;
  warningEventType: string | null;
  examState: ExamModeState;
  onWarningClose: () => void;
  showUnlockNotification: boolean;
  onUnlockContinue: () => void;
  showFullscreenExitConfirm?: boolean;
  isSubmittingFromFullscreenExit?: boolean;
  onFullscreenExitConfirm?: () => void;
  onFullscreenExitCancel?: () => void;
  warningCountdown?: number | null;
  recoveryCountdown?: number | null;
  recoverySource?: string | null;
  onRecoverFullscreen?: () => void;
  screenShareRecoveryCountdown?: number | null;
  isRequestingScreenShare?: boolean;
  isSubmittingFromScreenShareLoss?: boolean;
  onScreenShareReacquire?: () => void;
  webcamRecoveryCountdown?: number | null;
  isSubmittingFromWebcamLoss?: boolean;
  isRequestingWebcam?: boolean;
  onWebcamReacquire?: () => void;
  webcamModuleRole?: "primary" | "secondary" | null;
  viewportRecoveryCountdown?: number | null;
  isSubmittingFromViewportLoss?: boolean;
  isTablet?: boolean;
  showAutoSubmitNotice?: boolean;
  onAutoSubmitReturnToDashboard?: () => void;
}

export const ExamModals: React.FC<ExamModalsProps> = ({
  showWarning,
  pendingApiResponse,
  lastApiResponse,
  warningEventType,
  examState,
  onWarningClose,
  showUnlockNotification,
  onUnlockContinue,
  showFullscreenExitConfirm = false,
  isSubmittingFromFullscreenExit = false,
  onFullscreenExitConfirm,
  onFullscreenExitCancel,
  warningCountdown,
  recoveryCountdown,
  recoverySource,
  onRecoverFullscreen,
  screenShareRecoveryCountdown,
  isRequestingScreenShare = false,
  isSubmittingFromScreenShareLoss = false,
  onScreenShareReacquire,
  webcamRecoveryCountdown,
  isSubmittingFromWebcamLoss = false,
  isRequestingWebcam = false,
  onWebcamReacquire,
  webcamModuleRole,
  viewportRecoveryCountdown,
  isSubmittingFromViewportLoss = false,
  isTablet = false,
  showAutoSubmitNotice = false,
  onAutoSubmitReturnToDashboard,
}) => {
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");
  const isLocked = !!(lastApiResponse?.locked || lastApiResponse?.isLocked);
  const warningCloseCooldownActive =
    !pendingApiResponse && !isLocked && warningCountdown != null && warningCountdown > 0;
  const withButtonTestId = (testId: string, label: React.ReactNode) => (
    <span data-testid={testId}>{label}</span>
  );

  return (
    <>
      {/* Warning Modal - blocks until API responds */}
      <Modal
        data-testid="exam-warning-modal"
        open={showWarning}
        modalHeading={t("exam.violationWarning")}
        primaryButtonText={withButtonTestId(
          "exam-warning-confirm-btn",
          pendingApiResponse
            ? t("exam.processing")
            : warningCloseCooldownActive
            ? t("exam.warningCloseCooling", { defaultValue: "請等待倒數結束" })
            : isLocked
            ? tc("button.confirm")
            : t("exam.iUnderstand")
        )}
        primaryButtonDisabled={pendingApiResponse || warningCloseCooldownActive}
        onRequestSubmit={onWarningClose}
        onRequestClose={onWarningClose}
        preventCloseOnClickOutside
        danger
        size="sm"
      >
        <ModalAlertContent
          icon={
            <WarningAlt
              size={40}
              style={{
                color: pendingApiResponse
                  ? "var(--cds-icon-disabled)"
                  : "var(--cds-support-warning)",
              }}
            />
          }
          variant={pendingApiResponse ? "neutral" : "warning"}
          title={pendingApiResponse ? t("exam.recordingViolation") : t("exam.abnormalBehavior")}
        >
          {/* Event type */}
          <p className={styles.eventType}>
            {warningEventType === "exit_fullscreen" && t("exam.exitedFullscreen")}
            {warningEventType === "forbidden_action" && t("exam.forbiddenAction")}
            {warningEventType === "multiple_displays" && t("exam.multipleDisplaysDetected")}
            {warningEventType === "mouse_leave" && t("exam.mouseLeftWindow")}
          </p>

          <p className={styles.instruction}>{t("exam.stayInExamPage")}</p>

          {/* Warning close cooldown */}
          {warningCountdown != null && warningCountdown > 0 && !pendingApiResponse && !isLocked && (
            <p data-testid="exam-warning-countdown" className={styles.warningCountdown}>
              {t("exam.warningCloseIn", {
                defaultValue: "可在 {{seconds}} 秒後關閉警告",
                seconds: warningCountdown,
              })}
            </p>
          )}

          {/* Violation count box */}
          {!pendingApiResponse &&
            examState.violationCount !== undefined &&
            examState.maxWarnings !== undefined && (
              <div className={styles.statBox}>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>{t("exam.accumulatedViolations")}</span>
                  <span className={styles.statValueError}>{examState.violationCount}</span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>{t("exam.remainingChances")}</span>
                  <span className={isLocked ? styles.statValueError : styles.statValueSuccess}>
                    {isLocked
                      ? t("exam.alreadyLocked")
                      : Math.max(0, examState.maxWarnings + 1 - examState.violationCount)}
                  </span>
                </div>
              </div>
            )}

          {/* Warning message */}
          {isLocked ? (
            <p className={styles.errorNote}>{t("exam.examLocked")}</p>
          ) : (
            <p className={styles.smallErrorNote}>{t("exam.zeroChanceWarning")}</p>
          )}
          <p className={styles.secondaryNote}>
            {t("exam.monitoringStillActive", { defaultValue: "關閉警告後仍持續監控。" })}
          </p>
        </ModalAlertContent>
      </Modal>

      {/* Recovery warning (grace window before counting a violation) */}
      <Modal
        data-testid="exam-recovery-modal"
        open={recoveryCountdown != null}
        modalHeading={
          recoverySource === "tab_hidden"
            ? t("exam.tabHiddenRecoveryTitle", "偵測到分頁切換")
            : recoverySource === "window_blur"
            ? t("exam.windowBlurRecoveryTitle", "偵測到離開視窗")
            : recoverySource === "multiple_displays"
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
            {recoverySource === "tab_hidden"
              ? t("exam.tabHiddenRecoveryDesc", { defaultValue: "請在 {{seconds}} 秒內回到考試分頁，否則將記錄一次違規。", seconds: recoveryCountdown ?? 0 })
              : recoverySource === "window_blur"
              ? t("exam.windowBlurRecoveryDesc", { defaultValue: "請在 {{seconds}} 秒內回到考試視窗，否則將記錄一次違規。", seconds: recoveryCountdown ?? 0 })
              : recoverySource === "multiple_displays"
              ? t("exam.multiDisplayRecoveryDesc", { defaultValue: "請在 {{seconds}} 秒內中斷外接螢幕，否則將記錄一次違規。", seconds: recoveryCountdown ?? 0 })
              : recoverySource === "mouse_leave"
              ? t("exam.mouseLeaveRecoveryDesc", { seconds: recoveryCountdown ?? 0 })
              : t("exam.fullscreenRecoveryDesc", { seconds: recoveryCountdown ?? 0 })}
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
        open={screenShareRecoveryCountdown != null}
        modalHeading={t("exam.screenShareLostTitle")}
        primaryButtonText={withButtonTestId(
          "exam-screen-share-reshare-btn",
          isSubmittingFromScreenShareLoss
            ? t("exam.submittingExam")
            : isRequestingScreenShare
            ? t("exam.requestingScreenShare")
            : t("exam.reshareScreen")
        )}
        primaryButtonDisabled={isRequestingScreenShare || isSubmittingFromScreenShareLoss}
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
          {screenShareRecoveryCountdown != null && screenShareRecoveryCountdown > 0 && (
            <p className={styles.countdown}>
              {t("exam.screenShareForceSubmitIn", { seconds: screenShareRecoveryCountdown })}
            </p>
          )}
          <div className={styles.warningBox}>
            <p className={styles.warningBoxText}>{t("exam.screenShareTimeoutWarning")}</p>
          </div>
        </ModalAlertContent>
      </Modal>

      {/* Webcam Recovery Modal */}
      <Modal
        data-testid="exam-webcam-recovery-modal"
        open={webcamRecoveryCountdown != null}
        modalHeading={t("exam.webcamLostTitle", "Webcam 連線中斷")}
        primaryButtonText={withButtonTestId(
          "exam-webcam-recovery-btn",
          isSubmittingFromWebcamLoss
            ? t("exam.submittingExam")
            : isRequestingWebcam
            ? t("exam.requestingWebcam", "正在請求 Webcam…")
            : t("exam.reauthorizeWebcam", "重新授權 Webcam")
        )}
        primaryButtonDisabled={isRequestingWebcam || isSubmittingFromWebcamLoss}
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
          {webcamRecoveryCountdown != null && webcamRecoveryCountdown > 0 && (
            <p className={styles.countdown}>
              {webcamModuleRole === "primary"
                ? t("exam.webcamForceSubmitIn", {
                    defaultValue: "將在 {{seconds}} 秒後自動交卷",
                    seconds: webcamRecoveryCountdown,
                  })
                : t("exam.webcamStopIn", {
                    defaultValue: "將在 {{seconds}} 秒後記錄違規",
                    seconds: webcamRecoveryCountdown,
                  })}
            </p>
          )}
          {webcamModuleRole === "primary" && (
            <div className={styles.warningBox}>
              <p className={styles.warningBoxText}>
                {t("exam.webcamTimeoutWarning", "若未在時限內恢復 Webcam，系統將自動交卷。")}
              </p>
            </div>
          )}
        </ModalAlertContent>
      </Modal>

      {/* Viewport / Split View Recovery Modal */}
      <Modal
        data-testid="exam-viewport-recovery-modal"
        open={viewportRecoveryCountdown != null}
        modalHeading={
          isTablet
            ? t("exam.splitViewDetectedTitle", "偵測到分割畫面")
            : t("exam.viewportInterruptedTitle", "視窗大小異常")
        }
        primaryButtonText={withButtonTestId(
          "exam-viewport-recovery-btn",
          isSubmittingFromViewportLoss
            ? t("exam.submittingExam")
            : t("exam.iUnderstand")
        )}
        primaryButtonDisabled={isSubmittingFromViewportLoss}
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
          {viewportRecoveryCountdown != null && viewportRecoveryCountdown > 0 && (
            <p className={styles.countdown}>
              {t("exam.viewportPenaltyIn", {
                defaultValue: "將在 {{seconds}} 秒後記錄違規",
                seconds: viewportRecoveryCountdown,
              })}
            </p>
          )}
          <div className={styles.warningBox}>
            <p className={styles.warningBoxText}>
              {t("exam.viewportTimeoutWarning", "若未在時限內恢復，系統將記錄一次違規。")}
            </p>
          </div>
        </ModalAlertContent>
      </Modal>

      {/* Auto-Submit Notification */}
      <Modal
        data-testid="exam-auto-submit-modal"
        open={showAutoSubmitNotice}
        modalHeading={t("exam.autoSubmittedTitle")}
        primaryButtonText={withButtonTestId("exam-auto-submit-return-btn", t("exam.returnToDashboard"))}
        onRequestSubmit={onAutoSubmitReturnToDashboard}
        onRequestClose={onAutoSubmitReturnToDashboard}
        preventCloseOnClickOutside
        size="sm"
      >
        <ModalAlertContent
          icon={<DocumentExport size={40} style={{ color: "var(--cds-support-error)" }} />}
          variant="error"
          title={t("exam.autoSubmittedHeading")}
          description={t("exam.autoSubmittedDesc")}
        >
          <div className={styles.infoBox} style={{ textAlign: "center" }}>
            <p className={styles.infoBoxText}>{t("exam.autoSubmittedHint")}</p>
          </div>
        </ModalAlertContent>
      </Modal>

      {/* Fullscreen Exit Confirmation Modal */}
      <Modal
        data-testid="exam-fullscreen-exit-modal"
        open={showFullscreenExitConfirm}
        modalHeading={t("exam.confirmExitFullscreenAndSubmit")}
        primaryButtonText={withButtonTestId(
          "exam-fullscreen-exit-confirm-btn",
          isSubmittingFromFullscreenExit
            ? t("exam.submittingExam")
            : t("exam.confirmSubmitExam")
        )}
        secondaryButtonText={withButtonTestId("exam-fullscreen-exit-cancel-btn", tc("button.cancel"))}
        primaryButtonDisabled={isSubmittingFromFullscreenExit}
        onRequestSubmit={onFullscreenExitConfirm}
        onRequestClose={onFullscreenExitCancel}
        preventCloseOnClickOutside
        danger
        size="sm"
      >
        <ModalAlertContent
          icon={<WarningAlt size={40} style={{ color: "var(--cds-support-warning)" }} />}
          variant="warning"
          title={t("exam.leavingFullscreen")}
          description={<>{t("exam.leaveFullscreenWillSubmit")}<br />{t("exam.autoSubmitNoMoreAnswer")}</>}
        >
          <div className={styles.warningBox}>
            <p className={styles.warningBoxText}>{t("exam.cannotUndo")}</p>
          </div>
        </ModalAlertContent>
      </Modal>
    </>
  );
};
