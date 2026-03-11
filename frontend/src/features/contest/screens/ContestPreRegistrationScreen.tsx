import React, { useMemo, useState } from "react";
import { Button, Tag, InlineNotification } from "@carbon/react";
import { Login, Checkmark, Settings, Time } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";

import {
  getContestState,
  getContestStateColor,
  getContestStateLabel,
  type ContestDetail,
} from "@/core/entities/contest.entity";
import { HeroBase } from "@/shared/layout/HeroBase";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import SurfaceSection from "@/shared/layout/SurfaceSection";
import { ContestRegistrationModal } from "@/features/contest/components/modals/ContestRegistrationModal";
import { formatDate } from "@/shared/utils/format";
import { useInterval } from "@/shared/hooks/useInterval";
import styles from "./ContestPreRegistrationScreen.module.scss";

interface ContestPreRegistrationScreenProps {
  contest: ContestDetail;
  loading?: boolean;
  onJoin?: (data?: { nickname?: string; password?: string }) => void;
  isAdmin?: boolean;
  onOpenAdminPanel?: () => void;
}

/**
 * 競賽未加入頁面（學生/管理者共用）
 * 根據 hasJoined 與競賽狀態顯示可用操作
 */
const ContestPreRegistrationScreen: React.FC<ContestPreRegistrationScreenProps> = ({
  contest,
  loading,
  onJoin,
  isAdmin = false,
  onOpenAdminPanel,
}) => {
  const { t } = useTranslation("contest");
  // Registration Modal State
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const contestState = contest
    ? getContestState({
        status: contest.status,
        startTime: contest.startTime,
        endTime: contest.endTime,
      })
    : "upcoming";

  useInterval(
    () => setNowMs(Date.now()),
    contest && contestState === "upcoming" ? 1000 : null,
  );

  const isRegistrationOpen =
    contest?.status === "published" && contestState !== "ended";
  const startAtMs = contest ? new Date(contest.startTime).getTime() : Number.NaN;
  const countdownMs =
    contestState === "upcoming" && Number.isFinite(startAtMs)
      ? Math.max(0, startAtMs - nowMs)
      : null;

  const countdownText = useMemo(() => {
    if (countdownMs === null) return "";
    const totalSeconds = Math.floor(countdownMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return t("preRegistration.countdownValue", {
      days,
      hours,
      minutes,
      seconds,
      defaultValue: `${days}d ${hours}h ${minutes}m ${seconds}s`,
    });
  }, [countdownMs, t]);

  // Loading state
  if (loading || !contest) {
    return <HeroBase title="" loading={true} maxWidth="1056px" />;
  }

  // --- Badges ---
  const badges = (
    <>
      <Tag type={getContestStateColor(contestState)}>
        {t(`preRegistration.state.${contestState}`, getContestStateLabel(contestState))}
      </Tag>
      <Tag type={contest.visibility === "public" ? "green" : "purple"}>
        {contest.visibility === "public" ? t("public", "公開") : t("private", "私有")}
      </Tag>
      {contest.cheatDetectionEnabled && <Tag type="red">{t("examMode", "作弊檢查")}</Tag>}
      {contest.hasJoined && (
        <Tag type="teal" renderIcon={Checkmark}>
          {t("hero.registered", "已參與")}
        </Tag>
      )}
    </>
  );

  // --- Metadata (Time Info) ---
  const metadata = (
    <div className={styles.heroMeta}>
      <div className={styles.heroMetaItem}>
        <div className={styles.heroMetaLabel}>{t("startTime", "開始時間")}</div>
        <div className={styles.heroMetaValue}>
          {formatDate(contest.startTime, { includeSeconds: false })}
        </div>
      </div>
      <div className={styles.heroMetaItem}>
        <div className={styles.heroMetaLabel}>{t("endTime", "結束時間")}</div>
        <div className={styles.heroMetaValue}>
          {formatDate(contest.endTime, { includeSeconds: false })}
        </div>
      </div>
      {countdownMs !== null && (
        <div className={styles.countdownTile}>
          <Time size={16} className={styles.countdownIcon} />
          <div className={styles.countdownText}>
            <div className={styles.countdownLabel}>
              {t("preRegistration.countdownLabel", "距離開始")}
            </div>
            <div className={styles.countdownValue}>{countdownText}</div>
          </div>
        </div>
      )}
    </div>
  );

  // --- Actions (Register Button or Registered Status) ---
  const handleRegisterClick = () => {
    if (!isRegistrationOpen) return;
    setShowRegisterModal(true);
  };

  const handleRegisterSubmit = (data: { nickname?: string; password?: string }) => {
    setShowRegisterModal(false);
    onJoin?.(data);
  };

  const renderActions = () => {
    return (
      <div className={styles.actionsRow}>
        {contest.hasJoined ? (
          <div className={styles.registeredState}>
            <Checkmark size={20} className={styles.registeredIcon} />
            <span className={styles.registeredText}>
              {t("preRegistration.registeredHint", "已報名，等待競賽開始")}
            </span>
          </div>
        ) : (
          <Button
            kind="primary"
            size="lg"
            renderIcon={Login}
            onClick={handleRegisterClick}
            disabled={!isRegistrationOpen}
          >
            {isRegistrationOpen
              ? t("preRegistration.registerNow", "立即報名")
              : contestState === "ended"
                ? t("preRegistration.ended", "競賽已結束")
                : t("preRegistration.registrationClosed", "目前不可報名")}
          </Button>
        )}
        {isAdmin && onOpenAdminPanel ? (
          <Button
            kind="tertiary"
            size="lg"
            renderIcon={Settings}
            onClick={onOpenAdminPanel}
          >
            {t("preRegistration.openAdminPanel", "前往管理後台")}
          </Button>
        ) : null}
      </div>
    );
  };

  return (
    <>
      {/* Hero Section */}
      <HeroBase
        title={contest.name}
        description={
          contest.description ? (
            <MarkdownRenderer>{contest.description}</MarkdownRenderer>
          ) : (
            t("preRegistration.noDescription", "暫無描述")
          )
        }
        badges={badges}
        metadata={
          <>
            {metadata}
            <div className={styles.actionsWrap}>{renderActions()}</div>
          </>
        }
        maxWidth="1056px"
      />

      {/* Content Section */}
      <SurfaceSection maxWidth="1056px" style={{ minHeight: "400px", flex: 1 }}>
        <div className={styles.surfaceContent}>
          <div className={styles.notificationsStack}>
            {contest.cheatDetectionEnabled && (
              <InlineNotification
                kind="warning"
                title={t("overview.examModeWarning", "作弊檢查已啟用")}
                subtitle={t(
                  "overview.examModeDesc",
                  "此競賽已啟用作弊檢查。進入競賽後將啟動監控機制，包括全螢幕鎖定、分頁切換偵測等。違規行為將被記錄並可能導致作答被鎖定。"
                )}
                lowContrast
                hideCloseButton
              />
            )}

            {contest.visibility === "private" && !contest.hasJoined && (
              <InlineNotification
                kind="info"
                title={t("private", "私有")}
                subtitle={t(
                  "hero.privateContestHint",
                  "此競賽為私有競賽，報名時需要輸入加入密碼。"
                )}
                lowContrast
                hideCloseButton
              />
            )}

            {contest.anonymousModeEnabled && (
              <InlineNotification
                kind="info"
                title={t("preRegistration.anonymousTitle", "匿名模式")}
                subtitle={t(
                  "hero.anonymousModeHint",
                  "本競賽已啟用匿名模式，您可以設定一個暱稱。排行榜和提交列表將顯示您的暱稱而非真實帳號。"
                )}
                lowContrast
                hideCloseButton
              />
            )}
          </div>

          {contest.rules && (
            <section className={styles.rulesSection}>
              <h4 className={styles.rulesTitle}>
                {t("overview.contestRules", "競賽規則")}
              </h4>
              <MarkdownRenderer>{contest.rules}</MarkdownRenderer>
            </section>
          )}
        </div>
      </SurfaceSection>

      {/* Registration Modal */}
      <ContestRegistrationModal
        open={showRegisterModal}
        contest={contest}
        onClose={() => setShowRegisterModal(false)}
        onSubmit={handleRegisterSubmit}
      />
    </>
  );
};

export default ContestPreRegistrationScreen;
