import React, { useState, useEffect, useRef } from "react";
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
  Language,
  Checkmark,
} from "@carbon/icons-react";
import { useNavigate } from "react-router-dom";
import { Light, Asleep } from "@carbon/icons-react";
import { useTheme } from "@/ui/theme/ThemeContext";
import { useContentLanguage } from "@/contexts/ContentLanguageContext";
import { useTranslation } from "react-i18next";
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
  const {
    contentLanguage,
    setContentLanguage,
    supportedLanguages,
    getCurrentLanguageShortLabel,
  } = useContentLanguage();
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");

  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const languageMenuRef = useRef<HTMLDivElement>(null);

  // Close language menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        languageMenuRef.current &&
        !languageMenuRef.current.contains(event.target as Node)
      ) {
        setIsLanguageMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLanguageSelect = (langId: string) => {
    setContentLanguage(langId as typeof contentLanguage);
    setIsLanguageMenuOpen(false);
  };

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

        <div ref={languageMenuRef} style={{ position: "relative" }}>
          <HeaderGlobalAction
            aria-label={tc("language.switchTo")}
            tooltipAlignment="center"
            isActive={isLanguageMenuOpen}
            onClick={() => setIsLanguageMenuOpen(!isLanguageMenuOpen)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <Language size={20} />
              <span style={{ fontSize: "12px", fontWeight: 500 }}>
                {getCurrentLanguageShortLabel()}
              </span>
            </div>
          </HeaderGlobalAction>
          {isLanguageMenuOpen && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                backgroundColor: "var(--cds-layer-01)",
                border: "1px solid var(--cds-border-subtle)",
                borderRadius: "4px",
                boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
                minWidth: "150px",
                zIndex: 9999,
              }}
            >
              <div
                style={{
                  padding: "0.5rem 1rem",
                  fontSize: "0.75rem",
                  color: "var(--cds-text-secondary)",
                  borderBottom: "1px solid var(--cds-border-subtle)",
                }}
              >
                {tc("language.selectLanguage")}
              </div>
              {supportedLanguages.map((lang) => (
                <div
                  key={lang.id}
                  onClick={() => handleLanguageSelect(lang.id)}
                  style={{
                    padding: "0.75rem 1rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor:
                      contentLanguage === lang.id
                        ? "var(--cds-layer-selected-01)"
                        : "transparent",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor =
                      "var(--cds-layer-hover-01)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor =
                      contentLanguage === lang.id
                        ? "var(--cds-layer-selected-01)"
                        : "transparent")
                  }
                >
                  <span>{lang.label}</span>
                  {contentLanguage === lang.id && <Checkmark size={16} />}
                </div>
              ))}
            </div>
          )}
        </div>

        <HeaderGlobalAction
          aria-label={
            theme === "white"
              ? tc("theme.switchToDark")
              : tc("theme.switchToLight")
          }
          tooltipAlignment="center"
          onClick={toggleTheme}
        >
          {theme === "white" ? <Asleep size={20} /> : <Light size={20} />}
        </HeaderGlobalAction>

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
