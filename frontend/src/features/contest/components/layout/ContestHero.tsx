import React, { useState, useEffect, useCallback } from "react";
import { Button, Modal, Select, SelectItem } from "@carbon/react";
import {
  PlayFilled,
  Flag,
  WarningAltFilled,
  Launch,
  DocumentPdf,
} from "@carbon/icons-react";
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
import { downloadMyReport } from "@/infrastructure/api/repositories";
import { useInterval } from "@/shared/hooks/useInterval";
import { MetricBlock } from "@/shared/components/dashboard";
import styles from "./ContestHero.module.scss";

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
    <div className={styles.progressWrapper}>
      {label && <div className={styles.progressLabel}>{label}</div>}
      <div className={styles.progressBarContainer}>
        <div
          className={[styles.progressBarFill, isActive && styles.active, isFinished && styles.finished].filter(Boolean).join(" ")}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
};

interface ContestHeroProps {
  contest: ContestDetail | null;
  loading?: boolean;
  onStartExam?: () => void;
  onEndExam?: () => void;
  onGoToAnswering?: () => void;
  onTabChange?: (tab: string) => void;
  maxWidth?: string;
}

const ContestHero: React.FC<ContestHeroProps> = ({
  contest,
  loading,
  onStartExam,
  onEndExam,
  onGoToAnswering,
  maxWidth,
}) => {
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");
  const [progress, setProgress] = useState(0);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  // Report download state
  const [reportDownloading, setReportDownloading] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportLanguage, setReportLanguage] = useState("zh-TW");

  // Error Modal State
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setErrorModalOpen(true);
  };

  const handleDownloadReport = async () => {
    if (!contest) return;
    try {
      setReportDownloading(true);
      await downloadMyReport(contest.id.toString(), reportLanguage);
      setShowReportModal(false);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t("report.failed");
      showError(message);
    } finally {
      setReportDownloading(false);
    }
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
      {contest.attendanceCheckEnabled && (
        <Tag type="blue">{t("attendance.badge", "QR 簽到")}</Tag>
      )}
      {contest.cheatDetectionEnabled && <Tag type="red">{t("examMode")}</Tag>}
    </>
  );

  const metadata = (
    <>
      <MetricBlock label={t("startTime")} value={formatDate(startTime)} />
      <MetricBlock label={t("endTime")} value={formatDate(endTime)} />
    </>
  );

  const kpiCards = (
    <>
      <KpiCard
        icon={UserMultiple}
        value={contest.participantCount || 0}
        label={t("participantCount")}
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
    onStartExam?.();
  };

  const handleEndClick = () => {
    setShowEndConfirm(true);
  };
  const renderActions = () => {
    // Check if contest has ended (time-based)
    if (isEnded) {
      const hasSubmitted = contest.examStatus === "submitted" &&
        contest.hasJoined;
      if (hasSubmitted) {
        return (
          <Button
            kind="tertiary"
            renderIcon={DocumentPdf}
            onClick={() => setShowReportModal(true)}
          >
            {t("report.download")}
          </Button>
        );
      }
      return (
        <Button kind="secondary" disabled renderIcon={Flag}>
          {t("hero.examEnded")}
        </Button>
      );
    }

    // Use backend examStatus as source of truth — no frontend fallback guessing
    const examStatus = contest.examStatus || "not_started";

    // Contest must be published for exam actions
    if (contest.status !== "published") {
      return (
        <div className={styles.actionRow}>
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
          <div className={styles.actionRow}>
            <Button kind="secondary" disabled renderIcon={WarningAltFilled}>
              {t("hero.examLocked")}
            </Button>
          </div>
        );

      case "submitted":
        // Step 3: Submitted - show download + optional restart
        return (
          <div className={styles.actionRowCompact}>
            <Button
              kind="tertiary"
              renderIcon={DocumentPdf}
              onClick={() => setShowReportModal(true)}
            >
              {t("report.download")}
            </Button>
            {contest.allowMultipleJoins && (
              <Button renderIcon={PlayFilled} onClick={handleStartClick}>
                {t("hero.restartExam")}
              </Button>
            )}
          </div>
        );

      case "paused":
        return (
          <div className={styles.actionRow}>
            <Button renderIcon={PlayFilled} onClick={handleStartClick}>
              {t("hero.resumeExam")}
            </Button>
          </div>
        );

      case "in_progress":
        // Step 2: In progress - show end exam button
        return (
          <div className={styles.actionRow}>
            {onGoToAnswering && (
              <Button
                kind="tertiary"
                data-testid="contest-hero-go-answering-btn"
                renderIcon={Launch}
                onClick={onGoToAnswering}
              >
                {t("hero.goToAnswering")}
              </Button>
            )}
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
      default: {
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
          <div className={styles.actionRow}>
            <Button renderIcon={PlayFilled} onClick={handleStartClick}>
              {t("hero.startExam")}
            </Button>
          </div>
        );
      }
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
        <div className={styles.modalContent}>
          <p className={styles.modalDangerText}>
            {t("hero.confirmSubmitQuestion")}
          </p>
          <p>{t("hero.noMoreAnswer")}</p>
        </div>
      </Modal>

      {/* Report Download Modal */}
      <Modal
        open={showReportModal}
        modalHeading={t("report.download")}
        primaryButtonText={reportDownloading ? t("report.preparing") : t("report.download")}
        secondaryButtonText={tc("button.cancel")}
        primaryButtonDisabled={reportDownloading}
        onRequestClose={() => { if (!reportDownloading) setShowReportModal(false); }}
        onRequestSubmit={handleDownloadReport}
        size="xs"
      >
        <div className={styles.modalSpacing}>
          <Select
            id="report-language"
            labelText={t("report.language")}
            value={reportLanguage}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setReportLanguage(e.target.value)}
          >
            <SelectItem value="zh-TW" text="繁體中文" />
            <SelectItem value="en" text="English" />
            <SelectItem value="ja" text="日本語" />
            <SelectItem value="ko" text="한국어" />
          </Select>
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
