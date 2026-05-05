import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, Outlet, useParams } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbItem,
  Header,
  HeaderGlobalBar,
  HeaderGlobalAction,
  IconButton,
  Modal,
  HeaderNavigation,
} from "@carbon/react";
import {
  Maximize,
  Time,
  Renew,
  Dashboard,
  ChevronLeft,
  Home,
  List,
  SidePanelClose,
  SidePanelOpen,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import ExamModeWrapper from "@/features/contest/components/ExamModeWrapper";
import { ContestProvider } from "@/features/contest/contexts/ContestContext";
import { ExamModeMonitorModal } from "@/features/contest/components/modals/ExamModeMonitorModal";
import ExamStatusBadge from "@/features/contest/components/exam/ExamStatusBadge";
import { useContestTimers } from "@/features/contest/hooks/useContestTimers";
import { useContestExamActions } from "@/features/contest/hooks/useContestExamActions";
import { useContestLayoutState } from "@/features/contest/hooks/useContestLayoutState";
import {
  getClassroomContestDashboardPath,
  getClassroomContestPrecheckPath,
  getFirstContestProblemId,
  getClassroomContestSolvePath,
  shouldRouteToPrecheck,
} from "@/features/contest/domain/contestRoutePolicy";
import ExamSubmissionProgressModal from "@/features/contest/components/exam/ExamSubmissionProgressModal";
import { hasExamPrecheckPassed } from "@/features/contest/screens/paperExam/hooks";
import { SideMenu } from "@/features/app/components/SideMenu";
import { SideMenuToggle } from "@/features/app/components/SideMenuToggle";
import { UserMenu } from "@/features/app/components/UserMenu";
import { ContestLayoutHeaderSlotContext } from "./ContestLayoutHeaderSlotContext";
import { TimeDisplay } from "@/shared/components/dashboard";
import styles from "./ContestLayout.module.scss";

const ContestLayout = () => {
  const { classroomId } = useParams<{ classroomId?: string }>();
  const {
    contestId,
    contest,
    contestLoading,
    contestNotFound,
    isFullscreen,
    isRefreshing,
    isSolvePage,
    isPaperExamPage,
    hasEnded,
    isAdmin,
    userScore,
    totalMaxScore,
    scoreboardData,
    refreshContest,
    navigate,
  } = useContestLayoutState();

  const boundClassroomId = classroomId || contest?.boundClassroomId || undefined;
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");
  const dashboardPath =
    boundClassroomId && contestId
      ? getClassroomContestDashboardPath(boundClassroomId, contestId)
      : "/dashboard";
  const precheckPath =
    boundClassroomId && contestId
      ? getClassroomContestPrecheckPath(boundClassroomId, contestId)
      : "/dashboard";
  const firstProblemId =
    contest?.contestType === "coding"
      ? getFirstContestProblemId(contest)
      : undefined;
  const answeringPath =
    boundClassroomId && contestId
      ? getClassroomContestSolvePath(boundClassroomId, contestId, firstProblemId)
      : "/dashboard";
  const adminPath =
    boundClassroomId && contestId
      ? `${dashboardPath}/admin`
      : "/dashboard";

  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const [contestShellExpanded, setContestShellExpanded] = useState(
    () => typeof window !== "undefined" && window.innerWidth > 900,
  );
  const [headerActions, setHeaderActions] = useState<ReactNode>(null);
  const [monitoringModalOpen, setMonitoringModalOpen] = useState(false);
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const isContestParticipant = !!contest?.hasJoined;
  const lockContestMenu =
    isContestParticipant &&
    !!contest?.cheatDetectionEnabled &&
    contest.examStatus === "in_progress";

  const { timeLeft, isCountdownToStart, unlockTimeLeft } = useContestTimers({
    contest,
    contestId,
    refreshContest,
  });

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setErrorModalOpen(true);
  };

  const handleGoToAnswering = () => {
    if (!contestId || !contest) return;
    if (
      boundClassroomId &&
      shouldRouteToPrecheck({
        contest,
        precheckPassed: hasExamPrecheckPassed(contest.id),
      })
    ) {
      navigate(precheckPath);
      return;
    }
    navigate(answeringPath);
  };

  const {
    handleJoin,
    handleStartExam,
    handleEndExam,
    toggleFullscreen,
    submissionProgress,
  } = useContestExamActions({
    contest,
    contestId,
    hasEnded,
    refreshContest,
    navigate,
    messages: {
      joinError: t("error.joinFailed"),
      startError: t("error.startExamFailed"),
      endError: t("error.endExamFailed"),
      exitError: t("error.exitFailed"),
    },
    onError: showError,
  });
  const headerSlotValue = useMemo(
    () => ({ setHeaderActions }),
    [setHeaderActions],
  );

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

  if (contestNotFound) {
    return null;
  }

  const renderExamStatus = () => (
    <ExamStatusBadge
      examStatus={contest?.examStatus}
      cheatDetectionEnabled={contest?.cheatDetectionEnabled}
      timeLeft={timeLeft}
      unlockTimeLeft={unlockTimeLeft}
      lockReason={contest?.lockReason}
      autoUnlockAt={contest?.autoUnlockAt}
      onClick={() => setMonitoringModalOpen(true)}
    />
  );

  const renderContestBreadcrumb = () => {
    const contestName = contest?.name || t("mode");
    const answeringLabel = t("dashboard.answerLabel", "作答");
    const showAnsweringBreadcrumb =
      lockContestMenu || (isSolvePage && contest?.contestType === "coding");

    if (showAnsweringBreadcrumb) {
      return (
        <Breadcrumb noTrailingSlash className={styles.breadcrumb}>
          <BreadcrumbItem>{contestName}</BreadcrumbItem>
          <BreadcrumbItem isCurrentPage>{answeringLabel}</BreadcrumbItem>
        </Breadcrumb>
      );
    }

    if (boundClassroomId) {
      return (
        <Breadcrumb noTrailingSlash className={styles.breadcrumb}>
          <BreadcrumbItem>
            <Link to="/dashboard">{tc("nav.dashboard")}</Link>
          </BreadcrumbItem>
          <BreadcrumbItem>
            <Link to={`/classrooms/${boundClassroomId}`}>
              {tc("nav.classrooms", "教室")}
            </Link>
          </BreadcrumbItem>
          <BreadcrumbItem isCurrentPage>{contestName}</BreadcrumbItem>
        </Breadcrumb>
      );
    }

    return (
      <Breadcrumb noTrailingSlash className={styles.breadcrumb}>
        <BreadcrumbItem>
          <Link to="/dashboard">{tc("nav.dashboard")}</Link>
        </BreadcrumbItem>
        <BreadcrumbItem isCurrentPage>{contestName}</BreadcrumbItem>
      </Breadcrumb>
    );
  };

  const renderMainContent = () => {
    const outletContent = (
      <ContestProvider initialContest={contest} initialScoreboardData={scoreboardData} onRefresh={refreshContest}>
        <Outlet
          context={{
            refreshContest,
            onJoin: handleJoin,
            onStartExam: handleStartExam,
            onEndExam: handleEndExam,
            onGoToAnswering: handleGoToAnswering,
            onOpenAdminPanel: isAdmin ? () => navigate(adminPath) : undefined,
            isAdmin,
          }}
        />
      </ContestProvider>
    );

    if (isPaperExamPage) {
      return outletContent;
    }

    if (isSolvePage) {
      return outletContent;
    }

    return (
      <div className={styles.dashboardContent}>
        {outletContent}
      </div>
    );
  };

  const examModeProps = {
    contestId: contestId || "",
    cheatDetectionEnabled:
      isContestParticipant && !!contest?.cheatDetectionEnabled,
    isExamMonitored: isContestParticipant && !!contest?.isExamMonitored,
    requiresFullscreen: isContestParticipant && !!contest?.requiresFullscreen,
    hasEnded,
    lockReason: contest?.lockReason,
    examStatus: contest?.examStatus,
    onRefresh: refreshContest,
  };

  const showContestTimer =
    contest &&
    (!contest.cheatDetectionEnabled ||
      contest.examStatus === "not_started" ||
      contest.examStatus === "submitted");

  const showScoreDisplay =
    isSolvePage && contest?.problems && contest.problems.length > 0;
  const hideSolveNavExtras = isSolvePage && contest?.contestType === "coding";
  const isPaperSolvePage = isSolvePage && contest?.contestType === "paper_exam";
  const showContestShellSidebar =
    !isPaperSolvePage &&
    isContestParticipant &&
    !!contestId &&
    !!boundClassroomId &&
    (isSolvePage ||
      contest?.examStatus === "in_progress" ||
      contest?.examStatus === "paused" ||
      contest?.examStatus === "locked");
  const showContestMenuToggle =
    !showContestShellSidebar && !hideSolveNavExtras && !lockContestMenu;
  const effectiveSideMenuOpen = showContestMenuToggle && sideMenuOpen;
  const renderContestShellContent = () => {
    const mainContent = renderMainContent();
    if (!showContestShellSidebar) return mainContent;

    const homeLabel = t("contestShell.home", "總覽");
    const answeringLabel =
      contest?.contestType === "paper_exam"
        ? t("contestShell.paperAnswering", "作答")
        : t("contestShell.codingAnswering", "解題");

    return (
      <div className={styles.contestShellBody}>
        <aside
          className={[
            styles.contestShellSidebar,
            contestShellExpanded
              ? styles.contestShellSidebarExpanded
              : styles.contestShellSidebarCollapsed,
          ].join(" ")}
          aria-label={t("contestShell.sidebarLabel", "考試導覽")}
        >
          <div className={styles.contestShellNav}>
            <button
              type="button"
              className={`${styles.contestShellNavButton} ${
                !isSolvePage ? styles.contestShellNavButtonActive : ""
              }`}
              aria-current={!isSolvePage ? "page" : undefined}
              aria-label={homeLabel}
              title={homeLabel}
              onClick={() => navigate(dashboardPath)}
            >
              <Home size={20} />
              <span>{homeLabel}</span>
            </button>
            <button
              type="button"
              className={`${styles.contestShellNavButton} ${
                isSolvePage ? styles.contestShellNavButtonActive : ""
              }`}
              aria-current={isSolvePage ? "page" : undefined}
              aria-label={answeringLabel}
              title={answeringLabel}
              onClick={handleGoToAnswering}
            >
              <List size={20} />
              <span>{answeringLabel}</span>
            </button>
          </div>
          <div className={styles.contestShellFooter}>
            <IconButton
              kind="ghost"
              size="md"
              align="top"
              label={
                contestShellExpanded
                  ? tc("ui.collapseSidebar", "收合側欄")
                  : tc("ui.expandSidebar", "展開側欄")
              }
              onClick={() => setContestShellExpanded((expanded) => !expanded)}
              className={styles.contestShellToggle}
            >
              {contestShellExpanded ? (
                <SidePanelClose size={20} />
              ) : (
                <SidePanelOpen size={20} />
              )}
            </IconButton>
          </div>
        </aside>
        <div className={styles.contestShellContent}>{mainContent}</div>
      </div>
    );
  };

  return (
    <ExamModeWrapper {...examModeProps}>
      <ContestLayoutHeaderSlotContext.Provider value={headerSlotValue}>
      <div className={styles.root}>
        <Header aria-label={t("header.contestPlatform")}>
          {showContestMenuToggle ? (
            <SideMenuToggle
              isOpen={effectiveSideMenuOpen}
              onClick={() => setSideMenuOpen((o) => !o)}
            />
          ) : hideSolveNavExtras && !showContestShellSidebar ? (
            <button
              type="button"
              className={`side-menu-toggle ${styles.solveBackButton}`}
              aria-label={t("adminLayout.header.backToHome", "返回競賽主頁")}
              title={t("adminLayout.header.backToHome", "返回競賽主頁")}
              onClick={() => navigate(dashboardPath)}
            >
              <ChevronLeft size={20} />
            </button>
          ) : null}
          <div className={styles.headerBrand}>
            <Link to="/dashboard" className={styles.headerBrandLink}>
              {tc("header.prefix")}
            </Link>
            {renderContestBreadcrumb()}
          </div>

          <HeaderNavigation aria-label={tc("header.contestNavigation")}>
            {showContestTimer && !boundClassroomId && (
              <div className={styles.headerTimerDisplay}>
                <Time size={16} />
                <TimeDisplay
                  variant="header"
                  value={
                    isCountdownToStart
                      ? t("timeToStart", { time: timeLeft })
                      : timeLeft
                  }
                />
              </div>
            )}

            {showScoreDisplay && (
              <div className={styles.headerScoreDisplay}>
                <span className={styles.scoreLabel}>{t("overview.scoreLabel")}</span>
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

            {headerActions}

            {isAdmin && (
              <HeaderGlobalAction
                aria-label={t("preRegistration.openAdminPanel", "前往管理後台")}
                tooltipAlignment="center"
                onClick={() => navigate(adminPath)}
              >
                <Dashboard size={20} />
              </HeaderGlobalAction>
            )}

            <HeaderGlobalAction
              aria-label={isRefreshing ? t('action.refreshing') : t("refresh")}
              tooltipAlignment="center"
              onClick={isRefreshing ? undefined : refreshContest}
              className={styles.headerActions}
            >
              <Renew size={20} className={isRefreshing ? styles.refreshing : undefined} />
            </HeaderGlobalAction>

            {!isFullscreen && (
              <HeaderGlobalAction
                aria-label={t("enterFullscreen")}
                tooltipAlignment="center"
                onClick={toggleFullscreen}
                className={styles.headerActions}
              >
                <Maximize size={20} />
              </HeaderGlobalAction>
            )}

            <UserMenu
              contestMode
              contest={contest}
              onContestRefresh={refreshContest}
              settingsOnly={lockContestMenu}
            />
          </HeaderGlobalBar>

          {showContestMenuToggle ? (
            <SideMenu
              isOpen={effectiveSideMenuOpen}
              onClose={() => setSideMenuOpen(false)}
            />
          ) : null}
        </Header>

        <ExamModeMonitorModal
          open={monitoringModalOpen}
          onRequestClose={() => setMonitoringModalOpen(false)}
        />

        <div className={styles.mainContent}>
          <div className={styles.contentWrapper}>
            {renderContestShellContent()}
          </div>
        </div>

        <ExamSubmissionProgressModal
          state={submissionProgress.state}
          onRequestClose={submissionProgress.close}
        />

        <Modal
          open={errorModalOpen}
          modalHeading={tc("message.error")}
          passiveModal
          onRequestClose={() => setErrorModalOpen(false)}
        >
          <p>{errorMessage}</p>
        </Modal>
      </div>
      </ContestLayoutHeaderSlotContext.Provider>
    </ExamModeWrapper>
  );
};

export default ContestLayout;
