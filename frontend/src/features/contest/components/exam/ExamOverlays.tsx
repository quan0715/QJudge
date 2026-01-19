import React from "react";
import { Button } from "@carbon/react";
import { CheckmarkFilled, Locked } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";

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
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "#161616", // Always dark background for cinema/focus mode
            zIndex: 9998,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: "1.5rem",
          }}
        >
          <div style={{ textAlign: "center", maxWidth: "400px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                marginBottom: "1rem",
              }}
            >
              <CheckmarkFilled
                size={28}
                style={{ color: "var(--cds-support-success, #42be65)" }}
              />
              <span
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 600,
                  color: "var(--cds-text-on-color, #fff)",
                }}
              >
                {t("exam.modeEnabled")}
              </span>
            </div>
            <p
              style={{
                fontSize: "0.875rem",
                color: "var(--cds-text-on-color-disabled, #8d8d8d)",
                marginBottom: "2rem",
                lineHeight: 1.5,
              }}
            >
              {t("exam.antiCheatStarting")}
            </p>
            <div
              style={{
                fontSize: "6rem",
                fontWeight: 300,
                fontFamily: "'IBM Plex Mono', monospace",
                color: "var(--cds-text-on-color, #fff)",
                lineHeight: 1,
              }}
            >
              {gracePeriodCountdown}
            </div>
            <p
              style={{
                fontSize: "0.75rem",
                color: "var(--cds-text-on-color-disabled, #8d8d8d)",
                marginTop: "2rem",
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}
            >
              {t("exam.doNotSwitchTabs")}
            </p>
          </div>
        </div>
      )}

      {showLockScreen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "#161616", // Always dark background for lock screen
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
          }}
        >
          <div
            style={{ textAlign: "center", maxWidth: "480px", padding: "2rem" }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.75rem",
                marginBottom: "1rem",
              }}
            >
              <Locked
                size={40}
                style={{ color: "var(--cds-support-error, #fa4d56)" }}
              />
              <h1
                style={{
                  fontSize: "2rem",
                  fontWeight: 400,
                  margin: 0,
                  color: "var(--cds-support-error, #fa4d56)",
                }}
              >
                {t("exam.answerLocked")}
              </h1>
            </div>

            {/* Lock reason */}
            <p
              style={{
                fontSize: "1rem",
                color: "var(--cds-text-on-color-disabled, #8d8d8d)",
                marginBottom: "2rem",
                fontFamily: "'IBM Plex Mono', monospace",
              }}
            >
              {lockReason}
            </p>

            {/* Countdown box */}
            {timeLeft ? (
              <div
                style={{
                  margin: "2rem 0",
                  padding: "1.5rem 2rem",
                  backgroundColor: "var(--cds-layer-02, #262626)",
                  border: "1px solid var(--cds-border-subtle-01, #393939)",
                }}
              >
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--cds-text-on-color-disabled, #8d8d8d)",
                    marginBottom: "0.75rem",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                  }}
                >
                  {t("exam.autoUnlockCountdown")}
                </p>
                <div
                  style={{
                    fontSize: "2.5rem",
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontWeight: 400,
                    color: "var(--cds-support-success, #42be65)",
                    letterSpacing: "2px",
                  }}
                >
                  {timeLeft}
                </div>
              </div>
            ) : (
              <p
                style={{
                  fontSize: "1rem",
                  color: "var(--cds-text-on-color-disabled, #8d8d8d)",
                  marginBottom: "2rem",
                }}
              >
                {t("exam.contactProctorToUnlock")}
              </p>
            )}

            <p
              style={{
                fontSize: "0.875rem",
                color: "var(--cds-text-on-color-disabled, #6f6f6f)",
                marginTop: "1.5rem",
                marginBottom: "2rem",
              }}
            >
              {t("exam.violationRecorded")}
            </p>

            {/* Action */}
            <div style={{ marginTop: "1.5rem" }}>
              <Button
                kind="ghost"
                onClick={onBackToContest}
                style={{ color: "var(--cds-text-on-color, #fff)" }}
              >
                {t("exam.backToDashboard")}
              </Button>
              <p
                style={{
                  marginTop: "0.5rem",
                  fontSize: "0.75rem",
                  color: "var(--cds-text-on-color-disabled, #6f6f6f)",
                }}
              >
                {t("exam.canViewButNoAnswer")}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
