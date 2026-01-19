import React from "react";
import { Modal } from "@carbon/react";
import { WarningAlt, CheckmarkFilled } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ExamModeState } from "@/core/entities/contest.entity";

interface ExamModalsProps {
  showWarning: boolean;
  pendingApiResponse: boolean;
  lastApiResponse: { locked?: boolean } | null;
  warningEventType: string | null;
  examState: ExamModeState;
  onWarningClose: () => void;
  showUnlockNotification: boolean;
  onUnlockContinue: () => void;
  showFullscreenExitConfirm: boolean;
  isSubmittingFromFullscreenExit: boolean;
  onFullscreenExitConfirm: () => void;
  onFullscreenExitCancel: () => void;
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
  showFullscreenExitConfirm,
  isSubmittingFromFullscreenExit,
  onFullscreenExitConfirm,
  onFullscreenExitCancel,
}) => {
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");

  return (
    <>
      {/* Warning Modal - blocks until API responds */}
      <Modal
        open={showWarning}
        modalHeading={t("exam.violationWarning")}
        primaryButtonText={
          pendingApiResponse
            ? t("exam.processing")
            : lastApiResponse?.locked
            ? tc("button.confirm")
            : t("exam.iUnderstand")
        }
        primaryButtonDisabled={pendingApiResponse}
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
                      color: lastApiResponse?.locked
                        ? "var(--cds-support-error)"
                        : "var(--cds-support-success)",
                    }}
                  >
                    {lastApiResponse?.locked
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
          {lastApiResponse?.locked ? (
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
        </div>
      </Modal>

      {/* Unlock Notification Modal */}
      <Modal
        open={showUnlockNotification}
        modalHeading={t("exam.unlocked")}
        primaryButtonText={t("exam.continueExam")}
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

      {/* Fullscreen Exit Confirmation Modal (for locked/paused states) */}
      <Modal
        open={showFullscreenExitConfirm}
        modalHeading={t("exam.confirmExitFullscreenAndSubmit")}
        primaryButtonText={
          isSubmittingFromFullscreenExit
            ? t("exam.submittingExam")
            : t("exam.confirmSubmitExam")
        }
        secondaryButtonText={tc("button.cancel")}
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
