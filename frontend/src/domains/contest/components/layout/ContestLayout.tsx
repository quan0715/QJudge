import React, { useState, useEffect } from "react";
import { Outlet, useParams, useNavigate, useLocation } from "react-router-dom";
import {
  Header,
  HeaderName,
  HeaderGlobalBar,
  HeaderGlobalAction,
  Theme,
  Modal,
  HeaderNavigation,
  HeaderMenu,
  HeaderMenuItem,
  Button,
} from "@carbon/react";
import {
  Maximize,
  Minimize,
  View,
  Logout,
  Time,
  Renew,
  Locked,
  WarningAlt,
  WarningAltFilled,
} from "@carbon/icons-react";
import { useTheme } from "@/ui/theme/ThemeContext";
import { useTranslation } from "react-i18next";
import ExamModeWrapper from "@/domains/contest/components/ExamModeWrapper";
import {
  getContest,
  registerContest,
  leaveContest,
  startExam,
  endExam,
} from "@/services/contest";
import type { ContestDetail } from "@/core/entities/contest.entity";
import { UserMenu } from "@/ui/components/UserMenu";
import ContestHero from "@/domains/contest/components/layout/ContestHero";
import ContestTabs from "@/domains/contest/components/layout/ContestTabs";
import { ContentPage } from "@/ui/layout/ContentPage";
import { ContestProvider } from "@/domains/contest/contexts/ContestContext";
import { ExamModeMonitorModel } from "@/domains/contest/components/Model/ExamModeMonitorModel";

const ContestLayout = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [contest, setContest] = useState<ContestDetail | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>("00:00:00");
  const [isCountdownToStart, setIsCountdownToStart] = useState(false);
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [monitoringModalOpen, setMonitoringModalOpen] = useState(false);
  const [unlockTimeLeft, setUnlockTimeLeft] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { theme } = useTheme();
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");

  // Detect if we're on a solve page - hide hero/tabs for cleaner UI
  const isSolvePage = location.pathname.includes("/solve/");

  const isExamActive = !!(
    contest?.examModeEnabled && contest?.examStatus === "in_progress"
  );

  // Should warn on exit: when exam is in_progress, paused, or locked (not yet submitted)
  const shouldWarnOnExit = !!(
    contest?.examModeEnabled &&
    contest?.status === "active" &&
    (contest?.examStatus === "in_progress" ||
      contest?.examStatus === "paused" ||
      contest?.examStatus === "locked")
  );

  useEffect(() => {
    if (contestId) {
      getContest(contestId).then((c) => setContest(c || null));
    }
  }, [contestId]);

  // Beforeunload warning for exam mode
  useEffect(() => {
    if (!shouldWarnOnExit) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "考試進行中，離開或刷新頁面將自動交卷。";
      return e.returnValue;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [shouldWarnOnExit]);

  // Redirect paused users to overview
  useEffect(() => {
    if (contest?.examStatus === "paused") {
      const path = window.location.pathname;
      const restrictedPaths = [
        "/problems",
        "/solve",
        "/submissions",
        "/standings",
      ];
      if (restrictedPaths.some((p) => path.includes(p))) {
        navigate(`/contests/${contestId}`);
      }
    }
  }, [contest, contestId, navigate]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isExamActive) {
        e.preventDefault();
      }
    };

    if (isExamActive) {
      window.addEventListener("beforeunload", handleBeforeUnload);
    }

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isExamActive]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Track whether we've already refreshed for timer expiration to prevent infinite loops
  const hasRefreshedForTimerExpiration = React.useRef(false);

  useEffect(() => {
    if (!contest) return;

    // Reset the flag when contest changes from a user-initiated refresh
    hasRefreshedForTimerExpiration.current = false;

    const timer = setInterval(() => {
      const now = new Date().getTime();
      const start = new Date(contest.startTime).getTime();
      const end = new Date(contest.endTime).getTime();

      // Determine which target time to countdown to
      const contestNotStartedYet = now < start;
      setIsCountdownToStart(contestNotStartedYet);
      const targetTime = contestNotStartedYet ? start : end;
      const diff = targetTime - now;

      if (diff <= 0) {
        // Timer expired (Start or End reached) - refresh only once
        setTimeLeft("00:00:00");
        clearInterval(timer);

        // Only refresh once to prevent infinite loop
        if (!hasRefreshedForTimerExpiration.current) {
          hasRefreshedForTimerExpiration.current = true;
          refreshContest();
        }
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft(
          `${hours.toString().padStart(2, "0")}:${minutes
            .toString()
            .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
        );
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [contest?.id, contest?.startTime, contest?.endTime]);

  // Unlock countdown timer
  const hasRefreshedForUnlock = React.useRef(false);

  useEffect(() => {
    if (!contest || contest.examStatus !== "locked" || !contest.autoUnlockAt) {
      setUnlockTimeLeft(null);
      hasRefreshedForUnlock.current = false;
      return;
    }

    const timer = setInterval(() => {
      const now = new Date().getTime();
      const unlockTime = new Date(contest.autoUnlockAt!).getTime();
      const diff = unlockTime - now;

      if (diff <= 0) {
        setUnlockTimeLeft("00:00:00");
        clearInterval(timer);
        // Auto-refresh to get updated status - only once
        if (!hasRefreshedForUnlock.current) {
          hasRefreshedForUnlock.current = true;
          refreshContest();
        }
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setUnlockTimeLeft(
          `${hours.toString().padStart(2, "0")}:${minutes
            .toString()
            .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
        );
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [contest?.id, contest?.examStatus, contest?.autoUnlockAt]);

  const refreshContest = async () => {
    if (contestId) {
      setIsRefreshing(true);
      try {
        const c = await getContest(contestId);
        setContest(c || null);
      } finally {
        setIsRefreshing(false);
      }
    }
  };

  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setErrorModalOpen(true);
  };

  const handleJoin = async (data?: {
    nickname?: string;
    password?: string;
  }) => {
    if (!contest) return;
    try {
      await registerContest(contest.id, data);
      await refreshContest();
    } catch (error: any) {
      console.error("Failed to join contest:", error);
      showError(error.message || "無法加入競賽，請檢查密碼或稍後再試");
    }
  };

  const handleLeave = async () => {
    if (!contest) return;
    if (!confirm("確定要退出此競賽嗎？")) return;
    try {
      await leaveContest(contest.id);
      await refreshContest();
    } catch (error) {
      console.error("Failed to leave contest:", error);
      showError("無法退出競賽，請稍後再試");
    }
  };

  const handleStartExam = async () => {
    if (!contest) return;
    try {
      // Call start exam API and wait for response
      const response = await startExam(contest.id);

      // Only proceed if API call was successful
      if (
        response &&
        (response.status === "started" || response.status === "resumed")
      ) {
        // Request fullscreen if exam mode is enabled
        if (contest.examModeEnabled) {
          try {
            await document.documentElement.requestFullscreen();
          } catch (err) {
            console.error("Failed to enter fullscreen:", err);
          }
        }

        // Refresh contest data to get updated exam_status
        await refreshContest();
        // Navigate to problems after starting
        navigate(`/contests/${contest.id}/problems`);
      } else {
        // If response indicates failure, show error
        throw new Error(response?.error || "Unknown error");
      }
    } catch (error: any) {
      console.error("Failed to start exam:", error);
      // Show specific error message if available
      const errorMessage =
        error?.response?.data?.error ||
        error?.message ||
        "無法開始考試，請稍後再試";
      showError(errorMessage);
    }
  };

  const handleEndExam = async () => {
    if (!contest) return;
    // Confirmation is now handled by the caller (e.g., ContestHero)
    try {
      await endExam(contest.id);
      await refreshContest();
    } catch (error) {
      console.error("Failed to end exam:", error);
      showError("無法交卷，請稍後再試");
    }
  };

  const handleExit = async () => {
    if (!contestId || !contest) return;

    try {
      // If exam mode is enabled and exam is in_progress, paused, or locked, end the exam first (submit)
      if (
        contest.examModeEnabled &&
        contest.status === "active" &&
        (contest.examStatus === "in_progress" ||
          contest.examStatus === "paused" ||
          contest.examStatus === "locked")
      ) {
        await handleEndExam();
      }

      // Exit fullscreen if active
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen();
        } catch (e) {
          console.error("Failed to exit fullscreen:", e);
        }
      }

      // Then navigate away
      navigate("/contests");
    } catch (error) {
      console.error("Failed to leave contest", error);
      showError("無法離開競賽，請稍後再試");
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
    } catch (err) {
      console.error("Error toggling fullscreen:", err);
    }
  };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <Theme theme={theme}>
        <Header aria-label="Contest Platform">
          <HeaderName
            href={`/contests/${contestId}`}
            prefix="QJudge"
            onClick={(e) => {
              e.preventDefault();
              // Navigate to contest dashboard (within same contest)
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
            {isSolvePage &&
              contest?.problems &&
              contest.problems.length > 0 && (
                <HeaderMenu
                  aria-label="Problems"
                  menuLinkName={t("problemList")}
                >
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
          </HeaderNavigation>
          <HeaderGlobalBar>
            {/* Exam Status Display - Right side */}
            {contest && contest.examModeEnabled && (
              <>
                {/* Locked State - Combined with countdown */}
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

                {/* In Progress State - Click to show Exam Mode info */}
                {contest.examStatus === "in_progress" && (
                  <div
                    title={t("exam.monitoringHint")}
                    onClick={() => setMonitoringModalOpen(true)}
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
            )}

            <HeaderGlobalAction
              aria-label={isRefreshing ? t("refreshing") : t("refresh")}
              tooltipAlignment="center"
              onClick={isRefreshing ? undefined : refreshContest}
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
              aria-label={
                isFullscreen ? t("exitFullscreen") : t("enterFullscreen")
              }
              tooltipAlignment="center"
              onClick={toggleFullscreen}
            >
              {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </HeaderGlobalAction>

            {/* User Menu - contest mode: theme/language/nickname edit */}
            <UserMenu
              contestMode
              contest={contest}
              onContestRefresh={refreshContest}
            />

            <Button
              kind="danger--ghost"
              size="sm"
              renderIcon={Logout}
              onClick={() => setIsExitModalOpen(true)}
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

        {/* Monitoring Warning Modal */}
        <ExamModeMonitorModel
          open={monitoringModalOpen}
          onRequestClose={() => setMonitoringModalOpen(false)}
        />
      </Theme>

      <Theme
        theme={theme}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            marginTop: "3rem",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            backgroundColor: "var(--cds-background)",
          }}
        >
          <ContentPage
            hero={
              !isSolvePage ? (
                <ContestHero
                  contest={contest}
                  onJoin={handleJoin}
                  onLeave={handleLeave}
                  onStartExam={handleStartExam}
                  onEndExam={handleEndExam}
                  onRefreshContest={refreshContest}
                  maxWidth="1056px"
                />
              ) : undefined
            }
            stickyHeader={
              !isSolvePage && contest ? (
                <ContestTabs contest={contest} maxWidth="1056px" />
              ) : undefined
            }
          >
            <ExamModeWrapper
              contestId={contestId || ""}
              examModeEnabled={!!contest?.examModeEnabled}
              isActive={!!isExamActive}
              isLocked={contest?.examStatus === "locked"}
              lockReason={contest?.lockReason}
              examStatus={contest?.examStatus}
              currentUserRole={contest?.currentUserRole}
              onRefresh={refreshContest}
            >
              <ContestProvider
                initialContest={contest}
                onRefresh={refreshContest}
              >
                <Outlet context={{ refreshContest }} />
              </ContestProvider>
            </ExamModeWrapper>
          </ContentPage>
        </div>
      </Theme>

      <Modal
        open={isExitModalOpen}
        modalHeading={
          shouldWarnOnExit
            ? t("exitModal.confirmSubmitAndExit")
            : t("exitModal.confirmExit")
        }
        primaryButtonText={
          shouldWarnOnExit
            ? t("exitModal.submitAndExit")
            : t("exitModal.confirmExitBtn")
        }
        secondaryButtonText={tc("button.cancel")}
        onRequestClose={() => {
          // Just close the modal, don't force fullscreen
          setIsExitModalOpen(false);
        }}
        onRequestSubmit={handleExit}
        danger={shouldWarnOnExit}
      >
        <p>
          {(() => {
            // Teacher/Admin
            if (
              contest?.currentUserRole === "teacher" ||
              contest?.currentUserRole === "admin"
            ) {
              return t("exitModal.teacherAdminExit");
            }

            // Student - Not joined
            if (!contest?.hasJoined && !contest?.isRegistered) {
              return t("exitModal.studentNotJoined");
            }

            // Student - Joined but exam not started (or submitted)
            if (
              !contest?.status ||
              contest.status === "inactive" ||
              contest.examStatus === "submitted" ||
              contest.examStatus === "not_started"
            ) {
              return t("exitModal.studentNotJoined");
            }

            // Student - Exam in progress, paused, or locked (warn about auto-submit)
            const getExamStatusLabel = () => {
              if (contest?.examStatus === "in_progress") {
                return t("exitModal.examStatusInProgress");
              }
              if (contest?.examStatus === "paused") {
                return t("exitModal.examStatusPaused");
              }
              return t("exitModal.examStatusLocked");
            };

            return (
              <span>
                <strong
                  style={{
                    color: "var(--cds-support-error)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.25rem",
                  }}
                >
                  <WarningAlt size={16} /> {t("exitModal.warningAutoSubmit")}
                </strong>
                <br />
                <br />
                {t("exitModal.examStatusLabel", {
                  status: getExamStatusLabel(),
                })}
                <br />
                {t("exitModal.autoSubmitWarning")}
                <br />
                <br />
                {t("exitModal.confirmSubmitAndExitQuestion")}
              </span>
            );
          })()}
        </p>
      </Modal>

      {/* Error Modal */}
      <Modal
        open={errorModalOpen}
        modalHeading={tc("message.error")}
        passiveModal
        onRequestClose={() => setErrorModalOpen(false)}
      >
        <p>{errorMessage}</p>
      </Modal>
    </div>
  );
};

export default ContestLayout;
