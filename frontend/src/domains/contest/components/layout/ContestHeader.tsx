import React from "react";
import {
  Header,
  HeaderName,
  HeaderGlobalBar,
  HeaderGlobalAction,
  HeaderNavigation,
  HeaderMenu,
  HeaderMenuItem,
  Button,
} from "@carbon/react";
import {
  Maximize,
  Minimize,
  Time,
  Renew,
  Logout,
  Locked,
  WarningAltFilled,
  View,
} from "@carbon/icons-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { ContestDetail } from "@/core/entities/contest.entity";
import { UserMenu } from "@/ui/components/UserMenu";

interface ContestHeaderProps {
  contest: ContestDetail | null;
  contestId: string | undefined;
  timeLeft: string;
  isCountdownToStart: boolean;
  isFullscreen: boolean;
  isRefreshing: boolean;
  unlockTimeLeft: string | null;
  isSolvePage: boolean;
  onRefreshContest: () => void;
  onToggleFullscreen: () => void;
  onExitClick: () => void;
  onMonitoringClick: () => void;
}

/**
 * Contest header component with navigation and status display.
 * Extracted from ContestLayout for better maintainability.
 */
const ContestHeader: React.FC<ContestHeaderProps> = ({
  contest,
  contestId,
  timeLeft,
  isCountdownToStart,
  isFullscreen,
  isRefreshing,
  unlockTimeLeft,
  isSolvePage,
  onRefreshContest,
  onToggleFullscreen,
  onExitClick,
  onMonitoringClick,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation("contest");

  return (
    <Header aria-label="Contest Platform">
      <HeaderName
        href={`/contests/${contestId}`}
        prefix="QJudge"
        onClick={(e) => {
          e.preventDefault();
          navigate(`/contests/${contestId}`);
        }}
      >
        {contest?.name || t("mode")}
      </HeaderName>

      <HeaderNavigation aria-label="Contest Navigation">
        {/* Contest Timer for non-exam mode or before start */}
        {contest &&
          (!contest.examModeEnabled ||
            contest.examStatus === "not_started" ||
            contest.examStatus === "submitted") && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                height: "100%",
                padding: "0 1rem",
                color: "var(--cds-text-primary)",
                fontFamily: "var(--cds-code-font-family, monospace)",
                fontSize: "0.875rem",
              }}
            >
              <Time size={16} />
              <span>
                {isCountdownToStart
                  ? t("timeToStart", { time: timeLeft })
                  : timeLeft}
              </span>
            </div>
          )}

        {/* Problem Menu - For Solve Page */}
        {isSolvePage && contest?.problems && contest.problems.length > 0 && (
          <HeaderMenu aria-label="Problems" menuLinkName={t("problemList")}>
            {contest.problems.map((problem, index) => (
              <HeaderMenuItem
                key={problem.id}
                onClick={() =>
                  navigate(`/contests/${contestId}/solve/${problem.problemId}`)
                }
                style={{ minWidth: "300px", whiteSpace: "normal" }}
              >
                {problem.label || String.fromCharCode(65 + index)}.{" "}
                {problem.title}
              </HeaderMenuItem>
            ))}
          </HeaderMenu>
        )}
      </HeaderNavigation>

      <HeaderGlobalBar>
        {/* Exam Status Display */}
        {contest && contest.examModeEnabled && (
          <ContestExamStatusDisplay
            contest={contest}
            timeLeft={timeLeft}
            unlockTimeLeft={unlockTimeLeft}
            onMonitoringClick={onMonitoringClick}
          />
        )}

        <HeaderGlobalAction
          aria-label={isRefreshing ? t("refreshing") : t("refresh")}
          tooltipAlignment="center"
          onClick={isRefreshing ? undefined : onRefreshContest}
        >
          <Renew
            size={20}
            style={{
              animation: isRefreshing ? "spin 1s linear infinite" : "none",
            }}
          />
        </HeaderGlobalAction>

        {/* Keyframes for spin animation */}
        <style>
          {`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}
        </style>

        <HeaderGlobalAction
          aria-label={isFullscreen ? t("exitFullscreen") : t("enterFullscreen")}
          tooltipAlignment="center"
          onClick={onToggleFullscreen}
        >
          {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
        </HeaderGlobalAction>

        {/* User Menu - contest mode: only theme/language, nickname edit */}
        <UserMenu
          contestMode
          contest={contest}
          onContestRefresh={onRefreshContest}
        />

        <Button
          kind="danger--ghost"
          size="sm"
          renderIcon={Logout}
          onClick={onExitClick}
          style={{
            height: "100%",
            display: "flex",
            alignItems: "center",
          }}
        >
          {t("exit")}
        </Button>
      </HeaderGlobalBar>
    </Header>
  );
};

/**
 * Exam status display component showing locked/paused/in_progress states.
 */
interface ContestExamStatusDisplayProps {
  contest: ContestDetail;
  timeLeft: string;
  unlockTimeLeft: string | null;
  onMonitoringClick: () => void;
}

const ContestExamStatusDisplay: React.FC<ContestExamStatusDisplayProps> = ({
  contest,
  timeLeft,
  unlockTimeLeft,
  onMonitoringClick,
}) => {
  const { t } = useTranslation("contest");

  return (
    <>
      {/* Locked State */}
      {contest.examStatus === "locked" && (
        <div
          title={`${contest.lockReason || t("exam.lockedReason")}${
            contest.autoUnlockAt
              ? `\n${t("exam.expectedUnlock")}: ${new Date(
                  contest.autoUnlockAt
                ).toLocaleTimeString()}`
              : `\n${t("exam.contactProctor")}`
          }`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            height: "100%",
            padding: "0 1rem",
            backgroundColor: "var(--cds-support-error)",
            color: "#fff",
            fontWeight: "bold",
            fontSize: "0.875rem",
            cursor: "help",
          }}
        >
          <Locked size={16} />
          <span>{t("exam.locked")}</span>
          {unlockTimeLeft && (
            <span
              style={{
                fontFamily: "var(--cds-code-font-family, monospace)",
                marginLeft: "0.5rem",
                opacity: 0.9,
              }}
            >
              {unlockTimeLeft}
            </span>
          )}
        </div>
      )}

      {/* Paused State */}
      {contest.examStatus === "paused" && (
        <div
          title={t("exam.pausedHint")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            height: "100%",
            padding: "0 1rem",
            backgroundColor: "var(--cds-support-warning)",
            color: "#000",
            fontWeight: "bold",
            fontSize: "0.875rem",
            cursor: "help",
          }}
        >
          <WarningAltFilled size={16} />
          <span>{t("exam.paused")}</span>
        </div>
      )}

      {/* In Progress State */}
      {contest.examStatus === "in_progress" && (
        <div
          title={t("exam.monitoringHint")}
          onClick={onMonitoringClick}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            height: "100%",
            padding: "0 1rem",
            backgroundColor: "var(--cds-support-success)",
            color: "#fff",
            fontWeight: "bold",
            fontSize: "0.875rem",
            cursor: "pointer",
          }}
        >
          <View size={16} />
          <span>{t("exam.monitoring")}</span>
          <span
            style={{
              fontFamily: "var(--cds-code-font-family, monospace)",
              marginLeft: "0.5rem",
              opacity: 0.9,
            }}
          >
            {timeLeft}
          </span>
        </div>
      )}
    </>
  );
};

export default ContestHeader;
