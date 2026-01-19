import { useState, useEffect, useCallback } from "react";
import { Outlet, useParams, useNavigate, useLocation } from "react-router-dom";
import {
  Header,
  HeaderName,
  HeaderGlobalBar,
  HeaderGlobalAction,
  Modal,
  HeaderNavigation,
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
  WarningAltFilled,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import ExamModeWrapper from "@/features/contest/components/ExamModeWrapper";
import { getContest, getContestStandings } from "@/infrastructure/api/repositories";
import type { ContestDetail, ScoreboardData } from "@/core/entities/contest.entity";
import { isContestEnded, getContestState } from "@/core/entities/contest.entity";
import ContestPreRegistrationScreen from "@/features/contest/screens/ContestPreRegistrationScreen";
import ContestHero from "@/features/contest/components/layout/ContestHero";
import ContestTabs from "@/features/contest/components/layout/ContestTabs";
import { ContentPage } from "@/shared/layout/ContentPage";
import { ContestProvider } from "@/features/contest/contexts/ContestContext";
import { ExamModeMonitorModal } from "@/features/contest/components/modals/ExamModeMonitorModal";
import ContestExitModal from "@/features/contest/components/layout/ContestExitModal";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";
import { useContestTimers } from "@/features/contest/hooks/useContestTimers";
import { useContestExamActions } from "@/features/contest/hooks/useContestExamActions";
import styles from "./ContestLayout.module.scss";

const ContestLayout = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [contest, setContest] = useState<ContestDetail | null>(null);
  const [contestLoading, setContestLoading] = useState(true);
  const [contestNotFound, setContestNotFound] = useState(false);
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [monitoringModalOpen, setMonitoringModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [scoreboardData, setScoreboardData] = useState<ScoreboardData | null>(null);
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");

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

  // Fetch standings for score display (only on solve page)
  const fetchStandings = useCallback(async () => {
    if (!contestId) return;
    try {
      const data = await getContestStandings(contestId);
      setScoreboardData(data);
    } catch (err) {
      console.error("Failed to fetch standings:", err);
    }
  }, [contestId]);

  // Detect if we're on a solve page - hide hero/tabs for cleaner UI
  const isSolvePage = location.pathname.includes("/solve/");

  const isExamActive = !!(
    contest?.examModeEnabled && contest?.examStatus === "in_progress"
  );

  const hasEnded = !!contest && isContestEnded(contest);
  
  // Calculate contest state for pre-registration page
  const contestState = contest ? getContestState(contest) : null;
  const isUpcoming = contestState === "upcoming";
  
  // Check if user is admin (can edit contest) - admins skip pre-registration page
  const isAdmin = !!contest?.permissions?.canEditContest;

  const { timeLeft, isCountdownToStart, unlockTimeLeft } = useContestTimers({
    contest,
    contestId,
    refreshContest,
  });

  // Fetch standings when on solve page to display user score
  useEffect(() => {
    if (isSolvePage && contest?.id) {
      fetchStandings();
    }
  }, [isSolvePage, contest?.id, fetchStandings]);

  // Calculate user's current score and total max score
  const userScore = scoreboardData?.rows?.[0]?.totalScore ?? 0;
  const totalMaxScore = contest?.problems?.reduce((sum, p) => sum + (p.score || 0), 0) ?? 0;

  // Should warn on exit: when exam is in_progress, paused, or locked (not yet submitted)
  const shouldWarnOnExit = !!(
    contest?.examModeEnabled &&
    contest?.status === "published" &&
    !hasEnded &&
    (contest?.examStatus === "in_progress" ||
      contest?.examStatus === "paused" ||
      contest?.examStatus === "locked")
  );

  useEffect(() => {
    if (contestId) {
      setContestLoading(true);
      setContestNotFound(false);
      getContest(contestId)
        .then((c) => {
          if (c) {
            setContest(c);
            setContestNotFound(false);
          } else {
            // Contest not found (API returned undefined/404)
            setContest(null);
            setContestNotFound(true);
          }
        })
        .catch(() => {
          setContest(null);
          setContestNotFound(true);
        })
        .finally(() => {
          setContestLoading(false);
        });
    }
  }, [contestId]);

  // Redirect to 404 page if contest not found
  useEffect(() => {
    if (!contestLoading && contestNotFound) {
      navigate("/not-found", { replace: true });
    }
  }, [contestLoading, contestNotFound, navigate]);

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
      const isFullscreenNow = !!(
        document.fullscreenElement ||
        (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement ||
        (document as unknown as { msFullscreenElement?: Element }).msFullscreenElement
      );
      setIsFullscreen(isFullscreenNow);
    };
    
    // Add listeners for all browser prefixes
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);
    
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    };
  }, []);

  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const { confirm, modalProps } = useConfirmModal();

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setErrorModalOpen(true);
  };

  const {
    handleJoin,
    handleLeave,
    handleStartExam,
    handleEndExam,
    handleExit,
    toggleFullscreen,
  } = useContestExamActions({
    contest,
    contestId,
    hasEnded,
    refreshContest,
    confirmLeave: () =>
      confirm({
        title: "確定要退出此競賽嗎？",
        confirmLabel: tc("button.confirm"),
        cancelLabel: tc("button.cancel"),
        danger: true,
      }),
    navigate,
    messages: {
      joinError: "無法加入競賽，請檢查密碼或稍後再試",
      leaveError: "無法退出競賽，請稍後再試",
      startError: "無法開始考試，請稍後再試",
      endError: "無法交卷，請稍後再試",
      exitError: "無法離開競賽，請稍後再試",
    },
    onError: showError,
  });

  // Show loading state while fetching contest
  if (contestLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingContent}>
          <div className={styles.spinner} />
          <p className={styles.loadingText}>{tc("message.loading")}</p>
        </div>
      </div>
    );
  }

  // If contest not found, the useEffect will redirect to /404
  // Return null while redirecting
  if (contestNotFound) {
    return null;
  }

  // Helper to render exam status indicators
  const renderExamStatus = () => {
    if (!contest?.examModeEnabled) return null;

    if (contest.examStatus === "locked") {
      const title = `${contest.lockReason || t("exam.lockedReason")}${
        contest.autoUnlockAt
          ? `\n${t("exam.expectedUnlock")}: ${new Date(contest.autoUnlockAt).toLocaleTimeString()}`
          : `\n${t("exam.contactProctor")}`
      }`;
      return (
        <div title={title} className={styles.examStatusLocked}>
          <Locked size={16} />
          <span>{t("exam.locked")}</span>
          {unlockTimeLeft && (
            <span className={styles.examTimeDisplay}>{unlockTimeLeft}</span>
          )}
        </div>
      );
    }

    if (contest.examStatus === "paused") {
      return (
        <div title={t("exam.pausedHint")} className={styles.examStatusPaused}>
          <WarningAltFilled size={16} />
          <span>{t("exam.paused")}</span>
        </div>
      );
    }

    if (contest.examStatus === "in_progress") {
      return (
        <div
          title={t("exam.monitoringHint")}
          onClick={() => setMonitoringModalOpen(true)}
          className={styles.examStatusInProgress}
        >
          <View size={16} />
          <span>{t("exam.monitoring")}</span>
          <span className={styles.examTimeDisplay}>{timeLeft}</span>
        </div>
      );
    }

    return null;
  };

  // Helper to render main content based on state
  const renderMainContent = () => {
    // Pre-registration page for upcoming contests (skip for admins)
    if (isUpcoming && contest && !isAdmin) {
      return (
        <div className={styles.scrollableContent}>
          <ContestPreRegistrationScreen
            contest={contest}
            onJoin={handleJoin}
          />
        </div>
      );
    }

    // Solve page uses full-height layout without ContentPage wrapper
    if (isSolvePage) {
      return (
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
          <ContestProvider initialContest={contest} onRefresh={refreshContest}>
            <Outlet context={{ refreshContest }} />
          </ContestProvider>
        </ExamModeWrapper>
      );
    }

    // Default: ContentPage with hero and tabs
    return (
      <ContentPage
        hero={
          <ContestHero
            contest={contest}
            onJoin={handleJoin}
            onLeave={handleLeave}
            onStartExam={handleStartExam}
            onEndExam={handleEndExam}
            onRefreshContest={refreshContest}
            maxWidth="1056px"
          />
        }
        stickyHeader={
          contest ? <ContestTabs contest={contest} maxWidth="1056px" /> : undefined
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
          <ContestProvider initialContest={contest} onRefresh={refreshContest}>
            <Outlet context={{ refreshContest }} />
          </ContestProvider>
        </ExamModeWrapper>
      </ContentPage>
    );
  };

  const showContestTimer =
    contest &&
    (!contest.examModeEnabled ||
      contest.examStatus === "not_started" ||
      contest.examStatus === "submitted");

  const showScoreDisplay =
    isSolvePage && contest?.problems && contest.problems.length > 0;

  return (
    <div className={styles.root}>
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
            {showContestTimer && (
              <div className={styles.headerTimerDisplay}>
                <Time size={16} />
                <span>
                  {isCountdownToStart
                    ? t("timeToStart", { time: timeLeft })
                    : timeLeft}
                </span>
              </div>
            )}

            {showScoreDisplay && (
              <div className={styles.headerScoreDisplay}>
                <span className={styles.scoreLabel}>分數：</span>
                <span
                  className={`${styles.scoreValue} ${userScore > 0 ? styles.hasScore : ""}`}
                >
                  {userScore}
                </span>
                <span className={styles.scoreDivider}>/</span>
                <span className={styles.totalScore}>{totalMaxScore}</span>
              </div>
            )}
          </HeaderNavigation>

          <HeaderGlobalBar>
            {renderExamStatus()}

            <HeaderGlobalAction
              aria-label={isRefreshing ? t("refreshing") : t("refresh")}
              tooltipAlignment="center"
              onClick={isRefreshing ? undefined : refreshContest}
            >
              <Renew size={20} className={isRefreshing ? styles.refreshing : undefined} />
            </HeaderGlobalAction>

            <HeaderGlobalAction
              aria-label={isFullscreen ? t("exitFullscreen") : t("enterFullscreen")}
              tooltipAlignment="center"
              onClick={toggleFullscreen}
            >
              {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </HeaderGlobalAction>

            {/* <UserMenu
              contestMode
              contest={contest}
              onContestRefresh={refreshContest}
            /> */}

            <Button
              kind="danger--ghost"
              renderIcon={Logout}
              onClick={() => setIsExitModalOpen(true)}
              className={styles.exitButton}
            >
              {t("exit")}
            </Button>
          </HeaderGlobalBar>
        </Header>

        <ExamModeMonitorModal
          open={monitoringModalOpen}
          onRequestClose={() => setMonitoringModalOpen(false)}
        />

        <div className={styles.mainContent}>
          <div className={styles.contentWrapper}>
            {renderMainContent()}
          </div>
        </div>

        <ContestExitModal
          open={isExitModalOpen}
          contest={contest}
          shouldWarnOnExit={shouldWarnOnExit}
          onClose={() => setIsExitModalOpen(false)}
          onConfirm={handleExit}
        />

        <Modal
          open={errorModalOpen}
          modalHeading={tc("message.error")}
          passiveModal
          onRequestClose={() => setErrorModalOpen(false)}
        >
          <p>{errorMessage}</p>
        </Modal>

        <ConfirmModal {...modalProps} />
    </div>
  );
};

export default ContestLayout;
