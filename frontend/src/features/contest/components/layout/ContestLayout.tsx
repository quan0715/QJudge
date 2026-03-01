import { useState } from "react";
import { Outlet } from "react-router-dom";
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
import ContestExitModal from "@/features/contest/components/layout/ContestExitModal";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";
import { useContestTimers } from "@/features/contest/hooks/useContestTimers";
import { useContestExamActions } from "@/features/contest/hooks/useContestExamActions";
import { useContestLayoutState } from "@/features/contest/hooks/useContestLayoutState";
import styles from "./ContestLayout.module.scss";

const ContestLayout = () => {
  const {
    contestId,
    contest,
    contestLoading,
    contestNotFound,
    isFullscreen,
    isRefreshing,
    isSolvePage,
    isExamActive,
    hasEnded,
    isUpcoming,
    isAdmin,
    shouldWarnOnExit,
    userScore,
    totalMaxScore,
    refreshContest,
    navigate,
  } = useContestLayoutState();

  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");

  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [monitoringModalOpen, setMonitoringModalOpen] = useState(false);
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const { confirm, modalProps } = useConfirmModal();

  const { timeLeft, isCountdownToStart, unlockTimeLeft } = useContestTimers({
    contest,
    contestId,
    refreshContest,
  });

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

  const renderMainContent = () => {
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

          {isAdmin && (
            <HeaderGlobalAction
              aria-label={t("admin")}
              tooltipAlignment="center"
              onClick={() => navigate(`/contests/${contestId}/admin`)}
            >
              <Settings size={20} />
            </HeaderGlobalAction>
          )}

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
