import { useState } from "react";
import { Link, Outlet, useParams } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbItem,
  Header,
  HeaderGlobalBar,
  HeaderGlobalAction,
  Modal,
  HeaderNavigation,
} from "@carbon/react";
import {
  Maximize,
  Minimize,
  Time,
  Renew,
  Settings,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import ExamModeWrapper from "@/features/contest/components/ExamModeWrapper";
import ContestPreRegistrationScreen from "@/features/contest/screens/ContestPreRegistrationScreen";
import ContestHero from "@/features/contest/components/layout/ContestHero";
import ContestTabs from "@/features/contest/components/layout/ContestTabs";
import { ContentPage } from "@/shared/layout/ContentPage";
import { ContestProvider } from "@/features/contest/contexts/ContestContext";
import { ExamModeMonitorModal } from "@/features/contest/components/modals/ExamModeMonitorModal";
import ExamStatusBadge from "@/features/contest/components/exam/ExamStatusBadge";
import { useContestTimers } from "@/features/contest/hooks/useContestTimers";
import { useContestExamActions } from "@/features/contest/hooks/useContestExamActions";
import { useContestLayoutState } from "@/features/contest/hooks/useContestLayoutState";
import {
  getClassroomContestDashboardPath,
  getClassroomContestSolvePath,
} from "@/features/contest/domain/contestRoutePolicy";
import ExamSubmissionProgressModal from "@/features/contest/components/exam/ExamSubmissionProgressModal";
import { useClassroomName } from "@/features/classroom/hooks/useClassroomName";
import { SideMenu } from "@/features/app/components/SideMenu";
import { SideMenuToggle } from "@/features/app/components/SideMenuToggle";
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
    isUpcoming,
    isAdmin,
    userScore,
    totalMaxScore,
    scoreboardData,
    refreshContest,
    navigate,
  } = useContestLayoutState();

  const boundClassroomId = classroomId || contest?.boundClassroomId || undefined;
  const classroomName = useClassroomName(boundClassroomId);
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");
  const dashboardPath =
    boundClassroomId && contestId
      ? getClassroomContestDashboardPath(boundClassroomId, contestId)
      : "/dashboard";
  const adminPath =
    boundClassroomId && contestId
      ? `${dashboardPath}/admin`
      : "/dashboard";

  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const [monitoringModalOpen, setMonitoringModalOpen] = useState(false);
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

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
    navigate(
      boundClassroomId
        ? getClassroomContestSolvePath(boundClassroomId, contestId)
        : "/dashboard",
    );
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

  const renderMainContent = () => {
    const outletContent = (
      <ContestProvider initialContest={contest} initialScoreboardData={scoreboardData} onRefresh={refreshContest}>
        <Outlet context={{ refreshContest }} />
      </ContestProvider>
    );

    if (isPaperExamPage) {
      return outletContent;
    }

    if (isUpcoming && contest) {
      return (
        <div className={styles.scrollableContent}>
          <ContestPreRegistrationScreen
            contest={contest}
            onJoin={handleJoin}
            isAdmin={isAdmin}
            onOpenAdminPanel={
              isAdmin ? () => navigate(adminPath) : undefined
            }
          />
        </div>
      );
    }

    if (contest && !contest.hasJoined) {
      return (
        <div className={styles.scrollableContent}>
          <ContestPreRegistrationScreen
            contest={contest}
            onJoin={handleJoin}
            isAdmin={isAdmin}
            onOpenAdminPanel={
              isAdmin ? () => navigate(adminPath) : undefined
            }
          />
        </div>
      );
    }

    if (isSolvePage) {
      return outletContent;
    }

    return (
      <ContentPage
        hero={
          <ContestHero
            contest={contest}
            onStartExam={handleStartExam}
            onEndExam={handleEndExam}
            onGoToAnswering={handleGoToAnswering}
            onRefreshContest={refreshContest}
            maxWidth="1056px"
          />
        }
        stickyHeader={
            contest ? <ContestTabs contest={contest} maxWidth="1056px" /> : undefined
        }
      >
        {outletContent}
      </ContentPage>
    );
  };

  const examModeProps = {
    contestId: contestId || "",
    cheatDetectionEnabled: !!contest?.cheatDetectionEnabled,
    isExamMonitored: !!contest?.isExamMonitored,
    requiresFullscreen: !!contest?.requiresFullscreen,
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

  return (
    <ExamModeWrapper {...examModeProps}>
      {isPaperExamPage ? (
        renderMainContent()
      ) : (
        <div className={styles.root}>
          <Header aria-label={t("header.contestPlatform")}>
            <SideMenuToggle
              isOpen={sideMenuOpen}
              onClick={() => setSideMenuOpen((o) => !o)}
            />
            <div className={styles.headerBrand}>
              <Link to="/dashboard" className={styles.headerBrandLink}>
                {tc("header.prefix")}
              </Link>
              <Breadcrumb noTrailingSlash className={styles.breadcrumb}>
                {boundClassroomId ? (
                  <>
                    <BreadcrumbItem>
                      <Link to="/dashboard">{tc("nav.dashboard")}</Link>
                    </BreadcrumbItem>
                    <BreadcrumbItem>
                      <Link to={`/classrooms/${boundClassroomId}`}>
                        {classroomName || tc("nav.classrooms", "教室")}
                      </Link>
                    </BreadcrumbItem>
                    <BreadcrumbItem isCurrentPage>
                      {contest?.name || t("mode")}
                    </BreadcrumbItem>
                  </>
                ) : (
                  <>
                    <BreadcrumbItem>
                      <Link to="/dashboard">{tc("nav.dashboard")}</Link>
                    </BreadcrumbItem>
                    <BreadcrumbItem isCurrentPage>
                      {contest?.name || t("mode")}
                    </BreadcrumbItem>
                  </>
                )}
              </Breadcrumb>
            </div>

            <HeaderNavigation aria-label={tc("header.contestNavigation")}>
              {showContestTimer && !boundClassroomId && (
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

              {isAdmin && (
                <HeaderGlobalAction
                  aria-label={t("admin")}
                  tooltipAlignment="center"
                  onClick={() => navigate(adminPath)}
                >
                  <Settings size={20} />
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

              <HeaderGlobalAction
                aria-label={isFullscreen ? t("exitFullscreen") : t("enterFullscreen")}
                tooltipAlignment="center"
                onClick={toggleFullscreen}
                className={styles.headerActions}
              >
                {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
              </HeaderGlobalAction>
            </HeaderGlobalBar>

            <SideMenu
              isOpen={sideMenuOpen}
              onClose={() => setSideMenuOpen(false)}
            />
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
      )}
    </ExamModeWrapper>
  );
};

export default ContestLayout;
