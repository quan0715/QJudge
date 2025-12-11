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
import { Light, Asleep } from "@carbon/icons-react";
import { useTheme } from "@/ui/theme/ThemeContext";
import type { ContestDetail } from "@/core/entities/contest.entity";
import { UserAvatarDisplay } from "@/ui/components/UserAvatarDisplay";
import UserAvatarDisplayWithEdit from "./UserAvatarDisplayWithEdit";

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
  const { theme, toggleTheme } = useTheme();

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
        {contest?.name || "競賽模式"}
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
                {isCountdownToStart ? `距開始 ${timeLeft}` : timeLeft}
              </span>
            </div>
          )}

        {/* Problem Menu - For Solve Page */}
        {isSolvePage &&
          contest?.problems &&
          contest.problems.length > 0 && (
            <HeaderMenu aria-label="Problems" menuLinkName="題目列表">
              {contest.problems.map((problem, index) => (
                <HeaderMenuItem
                  key={problem.id}
                  onClick={() =>
                    navigate(
                      `/contests/${contestId}/solve/${problem.problemId}`
                    )
                  }
                  style={{ minWidth: "300px", whiteSpace: "normal" }}
                >
                  {problem.label || String.fromCharCode(65 + index)}.{" "}
                  {problem.title}
                </HeaderMenuItem>
              ))}
            </HeaderMenu>
          )}

        {/* User Avatar - Left side */}
        {contest && (
          <UserAvatarDisplayWithEdit
            contest={contest}
            onRefresh={onRefreshContest}
          />
        )}
        {!contest && <UserAvatarDisplay />}
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
          aria-label={
            theme === "white"
              ? "Switch to Dark Mode"
              : "Switch to Light Mode"
          }
          tooltipAlignment="center"
          onClick={toggleTheme}
        >
          {theme === "white" ? <Asleep size={20} /> : <Light size={20} />}
        </HeaderGlobalAction>

        <HeaderGlobalAction
          aria-label={isRefreshing ? "更新中..." : "重新整理競賽資訊"}
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
          aria-label={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          tooltipAlignment="center"
          onClick={onToggleFullscreen}
        >
          {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
        </HeaderGlobalAction>

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
          離開
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
  return (
    <>
      {/* Locked State */}
      {contest.examStatus === "locked" && (
        <div
          title={`${contest.lockReason || "違規行為"}${
            contest.autoUnlockAt
              ? `\n預計解鎖: ${new Date(
                  contest.autoUnlockAt
                ).toLocaleTimeString()}`
              : "\n請聯繫監考人員"
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
          <span>鎖定中</span>
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
          title="請點擊繼續考試以重新進入考試模式"
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
          <span>已暫停</span>
        </div>
      )}

      {/* In Progress State */}
      {contest.examStatus === "in_progress" && (
        <div
          title="考試監控中 - 點擊查看詳情"
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
          <span>監控中</span>
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
