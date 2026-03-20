import React from "react";
import { Modal } from "@carbon/react";
import { WarningAlt, CheckmarkFilled, ScreenOff, DocumentExport, VideoOff, FitToScreen } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ExamModeState } from "@/core/entities/contest.entity";

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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          {/* Icon */}
          <div
            style={{
              padding: "1rem",
              backgroundColor: pendingApiResponse
                ? "var(--cds-layer-02)"
                : "var(--cds-notification-background-warning)",
              borderRadius: "50%",
              marginBottom: "1.5rem",
            }}
          >
            <WarningAlt
              size={40}
              style={{
                color: pendingApiResponse
                  ? "var(--cds-icon-disabled)"
                  : "var(--cds-support-warning)",
              }}
            />
          </div>

          {/* Title */}
          <p
            style={{
              fontSize: "1.25rem",
              fontWeight: 600,
              marginBottom: "0.5rem",
              color: "var(--cds-text-primary)",
            }}
          >
            {pendingApiResponse
              ? t("exam.recordingViolation")
              : t("exam.abnormalBehavior")}
          </p>

          {/* Event type */}
          <p
            style={{
              marginBottom: "1rem",
              color: "var(--cds-text-secondary)",
              fontSize: "0.875rem",
            }}
          >
            {warningEventType === "tab_hidden" && t("exam.tabHidden")}
            {warningEventType === "window_blur" && t("exam.windowBlur")}
            {warningEventType === "exit_fullscreen" &&
              t("exam.exitedFullscreen")}
            {warningEventType === "forbidden_action" &&
              t("exam.forbiddenAction")}
            {warningEventType === "multiple_displays" &&
              t("exam.multipleDisplaysDetected")}
            {warningEventType === "mouse_leave" &&
              t("exam.mouseLeftWindow")}
          </p>

          {/* Instruction */}
          <p
            style={{
              marginBottom: "1.5rem",
              fontSize: "0.875rem",
              color: "var(--cds-text-primary)",
            }}
          >
            {t("exam.stayInExamPage")}
          </p>

          {/* Warning close cooldown */}
          {warningCountdown != null && warningCountdown > 0 && !pendingApiResponse && !isLocked && (
            <p
              data-testid="exam-warning-countdown"
              style={{
                marginBottom: "1rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "var(--cds-support-warning)",
              }}
            >
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
              <div
                style={{
                  width: "100%",
                  backgroundColor: "var(--cds-layer-01)",
                  padding: "1rem",
                  border: "1px solid var(--cds-border-subtle)",
                  marginBottom: "1rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "0.75rem",
                    fontSize: "0.875rem",
                  }}
                >
                  <span style={{ color: "var(--cds-text-secondary)" }}>
                    {t("exam.accumulatedViolations")}
                  </span>
                  <span
                    style={{
                      fontWeight: 600,
                      color: "var(--cds-support-error)",
                    }}
                  >
                    {examState.violationCount}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.875rem",
                  }}
                >
                  <span style={{ color: "var(--cds-text-secondary)" }}>
                    {t("exam.remainingChances")}
                  </span>
                  <span
                    style={{
                      fontWeight: 600,
                      color: isLocked
                        ? "var(--cds-support-error)"
                        : "var(--cds-support-success)",
                    }}
                  >
                    {isLocked
                      ? t("exam.alreadyLocked")
                      : Math.max(
                          0,
                          examState.maxWarnings + 1 - examState.violationCount
                        )}
                  </span>
                </div>
              </div>
            )}

          {/* Warning message */}
          {isLocked ? (
            <p
              style={{
                marginTop: "0.5rem",
                color: "var(--cds-support-error)",
                fontSize: "0.875rem",
                fontWeight: 600,
              }}
            >
              {t("exam.examLocked")}
            </p>
          ) : (
            <p
              style={{
                marginTop: "0.5rem",
                color: "var(--cds-support-error)",
                fontSize: "0.75rem",
              }}
            >
              {t("exam.zeroChanceWarning")}
            </p>
          )}
          <p
            style={{
              marginTop: "0.5rem",
              color: "var(--cds-text-secondary)",
              fontSize: "0.75rem",
            }}
          >
            {t("exam.monitoringStillActive", { defaultValue: "關閉警告後仍持續監控。" })}
          </p>
        </div>
      </Modal>

      {/* Recovery warning (grace window before counting a violation — fullscreen or mouse-leave) */}
      <Modal
        data-testid="exam-recovery-modal"
        open={recoveryCountdown != null}
        modalHeading={
          recoverySource === "mouse_leave"
            ? t("exam.mouseLeaveRecoveryTitle")
            : t("exam.fullscreenRecoveryTitle")
        }
        primaryButtonText={withButtonTestId(
          "exam-recovery-confirm-btn",
          recoverySource === "mouse_leave"
            ? t("exam.iUnderstand")
            : t("exam.returnToFullscreen")
        )}
        onRequestSubmit={recoverySource === "mouse_leave" ? undefined : onRecoverFullscreen}
        onRequestClose={recoverySource === "mouse_leave" ? undefined : onRecoverFullscreen}
        preventCloseOnClickOutside
        danger
        size="sm"
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          <p style={{ margin: 0, color: "var(--cds-text-primary)", lineHeight: 1.5 }}>
            {recoverySource === "mouse_leave"
              ? t("exam.mouseLeaveRecoveryDesc", { seconds: recoveryCountdown ?? 0 })
              : t("exam.fullscreenRecoveryDesc", { seconds: recoveryCountdown ?? 0 })}
          </p>
          <p style={{ margin: 0, color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
            {t("exam.stayInExamPage")}
          </p>
        </div>
      </Modal>

      {/* Unlock Notification Modal */}
      <Modal
        data-testid="exam-unlock-modal"
        open={showUnlockNotification}
        modalHeading={t("exam.unlocked")}
        primaryButtonText={withButtonTestId(
          "exam-unlock-continue-btn",
          t("exam.continueExam")
        )}
        onRequestSubmit={onUnlockContinue}
        onRequestClose={onUnlockContinue}
        preventCloseOnClickOutside
        size="sm"
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          {/* Icon */}
          <div
            style={{
              padding: "1rem",
              backgroundColor: "var(--cds-notification-background-success)",
              borderRadius: "50%",
              marginBottom: "1.5rem",
            }}
          >
            <CheckmarkFilled
              size={40}
              style={{ color: "var(--cds-support-success)" }}
            />
          </div>

          {/* Title */}
          <p
            style={{
              fontSize: "1.25rem",
              fontWeight: 600,
              marginBottom: "0.75rem",
              color: "var(--cds-text-primary)",
            }}
          >
            {t("exam.examUnlockedTitle")}
          </p>

          {/* Description */}
          <p
            style={{
              marginBottom: "1.5rem",
              fontSize: "0.875rem",
              color: "var(--cds-text-primary)",
              lineHeight: 1.5,
            }}
          >
            {t("exam.examUnlockedDesc")}
          </p>

          {/* Reminder */}
          <div
            style={{
              width: "100%",
              padding: "0.75rem 1rem",
              backgroundColor: "var(--cds-layer-01)",
              border: "1px solid var(--cds-border-subtle)",
              textAlign: "left",
            }}
          >
            <p
              style={{
                fontSize: "0.75rem",
                color: "var(--cds-text-secondary)",
                margin: 0,
              }}
            >
              {t("exam.followRulesReminder")}
            </p>
          </div>
        </div>
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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <div
            style={{
              padding: "1rem",
              backgroundColor: "var(--cds-notification-background-error)",
              borderRadius: "50%",
              marginBottom: "1.5rem",
            }}
          >
            <ScreenOff
              size={40}
              style={{ color: "var(--cds-support-error)" }}
            />
          </div>

          <p
            style={{
              fontSize: "1.25rem",
              fontWeight: 600,
              marginBottom: "0.75rem",
              color: "var(--cds-text-primary)",
            }}
          >
            {t("exam.screenShareLostHeading")}
          </p>

          <p
            style={{
              marginBottom: "1.5rem",
              fontSize: "0.875rem",
              color: "var(--cds-text-secondary)",
              lineHeight: 1.5,
            }}
          >
            {t("exam.screenShareLostDesc")}
          </p>

          {screenShareRecoveryCountdown != null && screenShareRecoveryCountdown > 0 && (
            <p
              style={{
                marginBottom: "1rem",
                fontSize: "1.5rem",
                fontWeight: 600,
                color: "var(--cds-support-error)",
              }}
            >
              {t("exam.screenShareForceSubmitIn", { seconds: screenShareRecoveryCountdown })}
            </p>
          )}

          <div
            style={{
              width: "100%",
              padding: "0.75rem 1rem",
              backgroundColor: "var(--cds-notification-background-error)",
              textAlign: "center",
            }}
          >
            <p
              style={{
                fontSize: "0.875rem",
                color: "var(--cds-support-error)",
                margin: 0,
                fontWeight: 600,
              }}
            >
              {t("exam.screenShareTimeoutWarning")}
            </p>
          </div>
        </div>
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
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ padding: "1rem", backgroundColor: "var(--cds-notification-background-error)", borderRadius: "50%", marginBottom: "1.5rem" }}>
            <VideoOff size={40} style={{ color: "var(--cds-support-error)" }} />
          </div>
          <p style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.75rem", color: "var(--cds-text-primary)" }}>
            {t("exam.webcamLostHeading", "Webcam 已停止運作")}
          </p>
          <p style={{ marginBottom: "1.5rem", fontSize: "0.875rem", color: "var(--cds-text-secondary)", lineHeight: 1.5 }}>
            {t("exam.webcamLostDesc", "系統偵測到 Webcam 連線中斷，請確認攝影機未被其他程式佔用。")}
          </p>
          {webcamRecoveryCountdown != null && webcamRecoveryCountdown > 0 && (
            <p style={{ marginBottom: "1rem", fontSize: "1.5rem", fontWeight: 600, color: "var(--cds-support-error)" }}>
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
            <div style={{ width: "100%", padding: "0.75rem 1rem", backgroundColor: "var(--cds-notification-background-error)", textAlign: "center" }}>
              <p style={{ fontSize: "0.875rem", color: "var(--cds-support-error)", margin: 0, fontWeight: 600 }}>
                {t("exam.webcamTimeoutWarning", "若未在時限內恢復 Webcam，系統將自動交卷。")}
              </p>
            </div>
          )}
        </div>
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
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ padding: "1rem", backgroundColor: "var(--cds-notification-background-error)", borderRadius: "50%", marginBottom: "1.5rem" }}>
            <FitToScreen size={40} style={{ color: "var(--cds-support-error)" }} />
          </div>
          <p style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.75rem", color: "var(--cds-text-primary)" }}>
            {isTablet
              ? t("exam.splitViewDetectedHeading", "請關閉 Split View / Slide Over")
              : t("exam.viewportInterruptedHeading", "請恢復考試視窗大小")}
          </p>
          <p style={{ marginBottom: "1.5rem", fontSize: "0.875rem", color: "var(--cds-text-secondary)", lineHeight: 1.5 }}>
            {isTablet
              ? t("exam.splitViewDetectedDesc", "考試期間不允許使用分割畫面或 Slide Over，請關閉後繼續作答。")
              : t("exam.viewportInterruptedDesc", "系統偵測到視窗大小或縮放異常，請恢復原始大小。")}
          </p>
          {viewportRecoveryCountdown != null && viewportRecoveryCountdown > 0 && (
            <p style={{ marginBottom: "1rem", fontSize: "1.5rem", fontWeight: 600, color: "var(--cds-support-error)" }}>
              {t("exam.viewportForceSubmitIn", {
                defaultValue: "將在 {{seconds}} 秒後自動交卷",
                seconds: viewportRecoveryCountdown,
              })}
            </p>
          )}
          <div style={{ width: "100%", padding: "0.75rem 1rem", backgroundColor: "var(--cds-notification-background-error)", textAlign: "center" }}>
            <p style={{ fontSize: "0.875rem", color: "var(--cds-support-error)", margin: 0, fontWeight: 600 }}>
              {t("exam.viewportTimeoutWarning", "若未在時限內恢復，系統將自動交卷。")}
            </p>
          </div>
        </div>
      </Modal>

      {/* Auto-Submit Notification (after screen share loss force submit) */}
      <Modal
        data-testid="exam-auto-submit-modal"
        open={showAutoSubmitNotice}
        modalHeading={t("exam.autoSubmittedTitle")}
        primaryButtonText={withButtonTestId(
          "exam-auto-submit-return-btn",
          t("exam.returnToDashboard")
        )}
        onRequestSubmit={onAutoSubmitReturnToDashboard}
        onRequestClose={onAutoSubmitReturnToDashboard}
        preventCloseOnClickOutside
        size="sm"
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <div
            style={{
              padding: "1rem",
              backgroundColor: "var(--cds-notification-background-error)",
              borderRadius: "50%",
              marginBottom: "1.5rem",
            }}
          >
            <DocumentExport
              size={40}
              style={{ color: "var(--cds-support-error)" }}
            />
          </div>

          <p
            style={{
              fontSize: "1.25rem",
              fontWeight: 600,
              marginBottom: "0.75rem",
              color: "var(--cds-text-primary)",
            }}
          >
            {t("exam.autoSubmittedHeading")}
          </p>

          <p
            style={{
              marginBottom: "1.5rem",
              fontSize: "0.875rem",
              color: "var(--cds-text-secondary)",
              lineHeight: 1.5,
            }}
          >
            {t("exam.autoSubmittedDesc")}
          </p>

          <div
            style={{
              width: "100%",
              padding: "0.75rem 1rem",
              backgroundColor: "var(--cds-layer-01)",
              border: "1px solid var(--cds-border-subtle)",
              textAlign: "center",
            }}
          >
            <p
              style={{
                fontSize: "0.75rem",
                color: "var(--cds-text-secondary)",
                margin: 0,
              }}
            >
              {t("exam.autoSubmittedHint")}
            </p>
          </div>
        </div>
      </Modal>

      {/* Fullscreen Exit Confirmation Modal (for locked/paused states) */}
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
        secondaryButtonText={withButtonTestId(
          "exam-fullscreen-exit-cancel-btn",
          tc("button.cancel")
        )}
        primaryButtonDisabled={isSubmittingFromFullscreenExit}
        onRequestSubmit={onFullscreenExitConfirm}
        onRequestClose={onFullscreenExitCancel}
        preventCloseOnClickOutside
        danger
        size="sm"
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          {/* Icon */}
          <div
            style={{
              padding: "1rem",
              backgroundColor: "var(--cds-notification-background-warning)",
              borderRadius: "50%",
              marginBottom: "1.5rem",
            }}
          >
            <WarningAlt
              size={40}
              style={{ color: "var(--cds-support-warning)" }}
            />
          </div>

          {/* Title */}
          <p
            style={{
              fontSize: "1.25rem",
              fontWeight: 600,
              marginBottom: "0.75rem",
              color: "var(--cds-text-primary)",
            }}
          >
            {t("exam.leavingFullscreen")}
          </p>

          {/* Description */}
          <p
            style={{
              marginBottom: "1.5rem",
              fontSize: "0.875rem",
              color: "var(--cds-text-secondary)",
              lineHeight: 1.5,
            }}
          >
            {t("exam.leaveFullscreenWillSubmit")}
            <br />
            {t("exam.autoSubmitNoMoreAnswer")}
          </p>

          {/* Warning */}
          <div
            style={{
              width: "100%",
              padding: "0.75rem 1rem",
              backgroundColor: "var(--cds-notification-background-error)",
              textAlign: "center",
            }}
          >
            <p
              style={{
                fontSize: "0.875rem",
                color: "var(--cds-support-error)",
                margin: 0,
                fontWeight: 600,
              }}
            >
              {t("exam.cannotUndo")}
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
};
