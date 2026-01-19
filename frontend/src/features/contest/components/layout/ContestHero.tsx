import React, { useState, useEffect, useCallback } from "react";
import { Button, Modal, TextInput } from "@carbon/react";
import { PlayFilled, Login, Flag, WarningAltFilled } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";

import type { ContestDetail } from "@/core/entities/contest.entity";
import { Tag } from "@carbon/react";
import { Time, UserMultiple, Catalog } from "@carbon/icons-react";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import {
  getContestState,
  getContestStateLabel,
  getContestStateColor,
} from "@/core/entities/contest.entity";
import { HeroBase } from "@/shared/layout/HeroBase";
import { KpiCard } from "@/shared/ui/dataCard";
import { updateNickname } from "@/infrastructure/api/repositories";
import { useInterval } from "@/shared/hooks/useInterval";
import "./ContestHero.css";

const MinimalProgressBar = ({
  value,
  label,
  status,
}: {
  value: number;
  label?: string;
  status?: string;
}) => {
  const isFinished = status === "ended" || status === "FINISHED";
  const isActive = status === "running";

  return (
    <div style={{ width: "100%", marginTop: "0", marginBottom: "1.25rem" }}>
      {label && (
        <div
          style={{
            marginBottom: "0.5rem",
            fontSize: "0.875rem",
            color: "var(--cds-text-secondary)",
            fontFamily: "var(--cds-font-family)",
          }}
        >
          {label}
        </div>
      )}
      <div className="contest-progress-bar-container">
        <div
          className={`contest-progress-bar-fill ${isActive ? "active" : ""} ${
            isFinished ? "finished" : ""
          }`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
};

interface ContestHeroProps {
  contest: ContestDetail | null;
  loading?: boolean;
  onJoin?: (data?: { nickname?: string; password?: string }) => void;
  onLeave?: () => void;
  onStartExam?: () => void;
  onEndExam?: () => void;
  onTabChange?: (tab: string) => void;
  onRefreshContest?: () => Promise<void>;
  maxWidth?: string;
}

const ContestHero: React.FC<ContestHeroProps> = ({
  contest,
  loading,
  onJoin,
  onStartExam,
  onEndExam,
  onRefreshContest,
  maxWidth,
}) => {
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");
  const [progress, setProgress] = useState(0);
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerNickname, setRegisterNickname] = useState("");
  const [password, setPassword] = useState("");

  // Update Nickname States
  const [showUpdateNicknameModal, setShowUpdateNicknameModal] = useState(false);
  const [newNickname, setNewNickname] = useState("");
  const [isUpdatingNickname, setIsUpdatingNickname] = useState(false);

  // Error Modal State
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setErrorModalOpen(true);
  };

  const updateProgress = useCallback(() => {
    if (!contest) return;
    const now = new Date().getTime();
    const start = new Date(contest.startTime).getTime();
    const end = new Date(contest.endTime).getTime();
    const total = end - start;
    const elapsed = now - start;

    if (now < start) {
      setProgress(0);
    } else if (now > end) {
      setProgress(100);
    } else {
      const p = (elapsed / total) * 100;
      setProgress(Math.min(100, Math.max(0, p)));
    }
  }, [contest]);

  useEffect(() => {
    updateProgress();
  }, [updateProgress]);

  useInterval(() => {
    updateProgress();
  }, contest ? 60000 : null);

  if (loading || !contest) {
    // Pass empty props to HeroBase for loading state
    return <HeroBase title="" loading={true} maxWidth={maxWidth} />;
  }

  // --- Logic from ContestHeroBase ---
  const startTime = new Date(contest.startTime);
  const endTime = new Date(contest.endTime);

  const getDuration = () => {
    const diff = endTime.getTime() - startTime.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 24) return `${Math.floor(hours / 24)} Days`;
    if (minutes > 0) return `${hours}h ${minutes}m`;
    return `${hours}h`;
  };

  const formatDate = (date: Date) => {
    return date.toLocaleString("zh-TW", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Calculate time-based state for accurate badge display
  const contestState = getContestState({
    status: contest.status,
    startTime: contest.startTime,
    endTime: contest.endTime,
  });
  const isEnded = contestState === "ended";

  const badges = (
    <>
      <Tag type={getContestStateColor(contestState)}>
        {getContestStateLabel(contestState)}
      </Tag>
      <Tag type={contest.visibility === "public" ? "green" : "purple"}>
        {contest.visibility === "public" ? t("public") : t("private")}
      </Tag>
      {contest.examModeEnabled && <Tag type="red">{t("examMode")}</Tag>}
    </>
  );

  const metadata = (
    <>
      <div>
        <div style={{ marginBottom: "0.25rem" }}>{t("startTime")}</div>
        <div style={{ color: "var(--cds-text-primary)", fontWeight: 600 }}>
          {formatDate(startTime)}
        </div>
      </div>
      <div>
        <div style={{ marginBottom: "0.25rem" }}>{t("endTime")}</div>
        <div style={{ color: "var(--cds-text-primary)", fontWeight: 600 }}>
          {formatDate(endTime)}
        </div>
      </div>
    </>
  );

  const kpiCards = (
    <>
      <KpiCard
        icon={UserMultiple}
        value={contest.participantCount || 0}
        label={t("participants")}
      />
      <KpiCard
        icon={Catalog}
        value={contest.problems?.length || 0}
        label={t("problems")}
      />
      <KpiCard icon={Time} value={getDuration()} label={t("duration")} />
    </>
  );

  const progressBar = (
    <MinimalProgressBar
      value={progress}
      label={
        contestState === "running"
          ? `${t("progress")} · ${Math.round(progress)}%`
          : t("notActive")
      }
      status={contestState}
    />
  );
  // ----------------------------------

  const handleStartClick = () => {
    if (contest.examModeEnabled) {
      setShowStartConfirm(true);
    } else {
      onStartExam?.();
    }
  };

  const handleEndClick = () => {
    setShowEndConfirm(true);
  };

  // Wrapper for onJoin to match the prop name expected by the button
  // const onJoinContest = onJoin;
  // We use handleJoinClick instead

  const renderActions = () => {
    // Check if contest has ended (time-based)
    if (isEnded) {
      return (
        <Button kind="secondary" disabled renderIcon={Flag}>
          {t("hero.examEnded")}
        </Button>
      );
    }

    // Step 0: Not registered
    if (!contest.hasJoined) {
      const handleRegisterClick = () => {
        if (contest.anonymousModeEnabled || contest.visibility === "private") {
          setShowRegisterModal(true);
        } else {
          onJoin?.();
        }
      };
      return (
        <Button renderIcon={Login} onClick={handleRegisterClick}>
          {t("hero.register")}
        </Button>
      );
    }

    // Determine my status
    const examStatus =
      contest.examStatus ||
      (contest.hasStarted ? "in_progress" : "not_started");

    // Contest must be published for exam actions
    if (contest.status !== "published") {
      return (
        <div style={{ display: "flex", alignItems: "center" }}>
          <Button kind="secondary" disabled renderIcon={Flag}>
            {t("hero.contestInactive")}
          </Button>
        </div>
      );
    }

    switch (examStatus) {
      case "locked":
        // Step 2.5: Locked - status is now shown in Navbar
        return (
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <Button kind="secondary" disabled renderIcon={WarningAltFilled}>
              {t("hero.examLocked")}
            </Button>
          </div>
        );

      case "submitted":
        // Step 3: Submitted - show finished or allow restart
        if (contest.allowMultipleJoins) {
          return (
            <div style={{ display: "flex", alignItems: "center" }}>
              <Button renderIcon={PlayFilled} onClick={handleStartClick}>
                {t("hero.restartExam")}
              </Button>
            </div>
          );
        }
        return (
          <div style={{ display: "flex", alignItems: "center" }}>
            <Button kind="secondary" disabled renderIcon={Flag}>
              {t("hero.finished")}
            </Button>
          </div>
        );

      case "paused":
        return (
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <Button renderIcon={PlayFilled} onClick={handleStartClick}>
              {t("hero.resumeExam")}
            </Button>
          </div>
        );

      case "in_progress":
        // Step 2: In progress - show end exam button
        return (
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            {onEndExam && (
              <Button
                kind="danger--tertiary"
                renderIcon={Flag}
                onClick={handleEndClick}
              >
                {t("hero.submitExam")}
              </Button>
            )}
            {!onEndExam && (
              <Button kind="secondary" disabled>
                {t("hero.inProgress")}
              </Button>
            )}
          </div>
        );

      case "not_started":
      default:
        // Check if contest hasn't started yet (time-based)
        const contestNotStartedYet = new Date(contest.startTime) > new Date();
        if (contestNotStartedYet) {
          return (
            <Button kind="secondary" disabled renderIcon={PlayFilled}>
              {t("hero.notYetStarted")}
            </Button>
          );
        }
        // Step 1 (not started): Show start button
        return (
          <div style={{ display: "flex", gap: "1rem" }}>
            <Button renderIcon={PlayFilled} onClick={handleStartClick}>
              {t("hero.startExam")}
            </Button>
          </div>
        );
    }
  };

  return (
    <>
      <HeroBase
        title={contest.name}
        description={
          <MarkdownRenderer>
            {contest.description || "No description provided."}
          </MarkdownRenderer>
        }
        badges={badges}
        metadata={metadata}
        actions={renderActions()}
        kpiCards={kpiCards}
        progressBar={progressBar}
        loading={loading}
        maxWidth={maxWidth}
      />

      {/* Start Exam Confirmation Modal */}
      <Modal
        open={showStartConfirm}
        modalHeading={t("hero.startExamConfirm")}
        primaryButtonText={t("hero.confirmStart")}
        secondaryButtonText={tc("button.cancel")}
        onRequestSubmit={() => {
          setShowStartConfirm(false);
          onStartExam?.();
        }}
        onRequestClose={() => setShowStartConfirm(false)}
        danger
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <p style={{ fontSize: "1rem", fontWeight: "bold" }}>
            {t("hero.antiCheatEnabled")}
          </p>
          <ul
            style={{
              listStyleType: "disc",
              paddingLeft: "1.5rem",
              lineHeight: "1.6",
            }}
          >
            <li>{t("hero.keepFullscreen")}</li>
            <li>{t("hero.noSwitchTabs")}</li>
            <li>
              {t("hero.maxWarnings", { count: contest.maxCheatWarnings })}
            </li>
          </ul>
          <p>{t("hero.enterFullscreenOnStart")}</p>
        </div>
      </Modal>

      {/* End Exam Confirmation Modal */}
      <Modal
        open={showEndConfirm}
        modalHeading={t("hero.confirmSubmit")}
        primaryButtonText={t("hero.confirmSubmit")}
        secondaryButtonText={tc("button.cancel")}
        onRequestSubmit={() => {
          setShowEndConfirm(false);
          onEndExam?.();
        }}
        onRequestClose={() => setShowEndConfirm(false)}
        danger
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <p style={{ fontSize: "1rem", fontWeight: "bold", color: "#da1e28" }}>
            {t("hero.confirmSubmitQuestion")}
          </p>
          <p>{t("hero.noMoreAnswer")}</p>
        </div>
      </Modal>

      {/* Update Nickname Modal */}
      <Modal
        open={showUpdateNicknameModal}
        modalHeading={t("hero.updateNickname")}
        primaryButtonText={
          isUpdatingNickname ? t("hero.updating") : t("hero.confirmUpdate")
        }
        secondaryButtonText={tc("button.cancel")}
        onRequestClose={() => setShowUpdateNicknameModal(false)}
        onRequestSubmit={async () => {
          if (!contest) return;
          setIsUpdatingNickname(true);
          try {
            await updateNickname(contest.id, newNickname);
            setShowUpdateNicknameModal(false);
            if (onRefreshContest) {
              await onRefreshContest();
            } else {
              // Fallback if no refresh function provided (shouldn't happen in updated layout)
              console.warn("No refresh function provided");
            }
          } catch (error: any) {
            console.error("Failed to update nickname", error);
            showError(error.message || t("hero.updateFailed"));
          } finally {
            setIsUpdatingNickname(false);
          }
        }}
        primaryButtonDisabled={isUpdatingNickname}
      >
        <div style={{ marginBottom: "1rem" }}>
          <p style={{ marginBottom: "1rem" }}>{t("hero.nicknameHint")}</p>
          <TextInput
            id="update-nickname"
            labelText={t("hero.nicknameLabel")}
            placeholder={t("hero.nicknamePlaceholder")}
            value={newNickname}
            onChange={(e: any) => setNewNickname(e.target.value)}
          />
        </div>
      </Modal>

      {/* Registration Modal */}
      <Modal
        open={showRegisterModal}
        modalHeading={t("hero.contestRegister")}
        primaryButtonText={t("hero.confirmRegister")}
        secondaryButtonText={tc("button.cancel")}
        onRequestSubmit={() => {
          setShowRegisterModal(false);
          onJoin?.({
            nickname: registerNickname || undefined,
            password: password || undefined,
          });
          setRegisterNickname("");
          setPassword("");
        }}
        onRequestClose={() => {
          setShowRegisterModal(false);
          setRegisterNickname("");
          setPassword("");
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
            }}
          >
            {contest.visibility === "private" && (
              <div>
                <p style={{ marginBottom: "0.5rem" }}>
                  {t("hero.privateContestHint")}
                </p>
                <TextInput
                  id="password"
                  labelText={t("hero.passwordLabel")}
                  type="password"
                  placeholder={t("hero.passwordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            )}

            {contest.anonymousModeEnabled && (
              <div>
                <p style={{ marginBottom: "0.5rem" }}>
                  {t("hero.anonymousModeHint")}
                </p>
                <TextInput
                  id="nickname"
                  labelText={t("hero.nicknameOptional")}
                  placeholder={t("hero.leaveBlankForDefault")}
                  value={registerNickname}
                  onChange={(e: any) => setRegisterNickname(e.target.value)}
                  maxLength={50}
                />
                <p
                  style={{
                    fontSize: "0.875rem",
                    color: "var(--cds-text-secondary)",
                    marginTop: "0.5rem",
                  }}
                >
                  {t("hero.canChangeNicknameLater")}
                </p>
              </div>
            )}

            {/* Confirmation if no special inputs required but modal opened for some reason? 
              Logic above ensures modal only opens if private or anonymous. 
          */}
          </form>
        </div>
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
    </>
  );
};

export default ContestHero;
