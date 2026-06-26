import { useCallback, useEffect, useState } from "react";
import {
  Camera,
  ChevronLeft,
  FitToScreen,
  Login,
  Logout,
  QrCode,
  SendAlt,
  ShrinkScreen,
} from "@carbon/icons-react";
import { QRCodeSVG } from "@rc-component/qrcode";
import { Button, InlineNotification } from "@carbon/react";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";

import type { AttendancePurpose, ContestDetail } from "@/core/entities/contest.entity";
import { exitFullscreen, isFullscreen, requestFullscreen } from "@/core/usecases/exam";
import { getAttendanceQrToken } from "@/infrastructure/api/repositories/attendance.repository";
import { useContest } from "@/features/contest/contexts/ContestContext";
import type { AttendanceTranslate } from "@/features/contest/screens/attendance/lib/photoRequirements";
import {
  formatContestClockTime,
  formatContestCountdownDuration,
  formatContestMonthDay,
} from "@/features/contest/utils/contestTimeFormat";
import {
  getProjectionTokenRefreshDelayMs,
  type ProjectionTokenState,
} from "./lib/projectionTokenRefresh";
import styles from "./AttendanceProjectionScreen.module.scss";

type TokenState = ProjectionTokenState;
type ErrorState = Partial<Record<AttendancePurpose, string>>;
type ProjectionDisplayMode = AttendancePurpose;

const ATTENDANCE_PURPOSES: AttendancePurpose[] = ["check_in", "check_out"];

function getExamWindow(contest: ContestDetail | null | undefined) {
  const start = contest?.startTime ? new Date(contest.startTime).getTime() : NaN;
  const end = contest?.endTime ? new Date(contest.endTime).getTime() : NaN;
  return {
    start: Number.isFinite(start) ? start : null,
    end: Number.isFinite(end) ? end : null,
  };
}

function getCountdown(
  contest: ContestDetail | null | undefined,
  now: number,
  tr: AttendanceTranslate,
): { label: string; value: string; tone: string } {
  const { start, end } = getExamWindow(contest);
  if (start == null || end == null) {
    return {
      label: tr("attendance.projection.countdown.exam", "考試倒數"),
      value: "--:--:--",
      tone: tr("attendance.projection.countdown.unset", "未設定時間"),
    };
  }
  if (now < start) {
    return {
      label: tr("attendance.projection.countdown.startsIn", "距離開始"),
      value: formatContestCountdownDuration(start - now),
      tone: tr("attendance.projection.countdown.openCheckIn", "開放簽到"),
    };
  }
  if (now < end) {
    return {
      label: tr("attendance.projection.countdown.endsIn", "距離截止"),
      value: formatContestCountdownDuration(end - now),
      tone: tr("attendance.projection.countdown.running", "考試進行中"),
    };
  }
  return {
    label: tr("attendance.projection.countdown.ended", "考試已結束"),
    value: "00:00:00",
    tone: tr("attendance.projection.countdown.endedTone", "已結束"),
  };
}

function getCountdownProgress(contest: ContestDetail | null | undefined, now: number): number {
  const { start, end } = getExamWindow(contest);
  if (start == null || end == null || end <= start) return 0;
  if (now <= start) return 0;
  if (now >= end) return 100;
  return Math.round(((now - start) / (end - start)) * 100);
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function useProjectionTokens(contestId: string | undefined, errorFallback: string) {
  const [tokens, setTokens] = useState<TokenState>({});
  const [errors, setErrors] = useState<ErrorState>({});

  const refresh = useCallback(async () => {
    if (!contestId) return;
    const results = await Promise.allSettled(
      ATTENDANCE_PURPOSES.map(async (purpose) => ({
        purpose,
        token: await getAttendanceQrToken(contestId, purpose),
      })),
    );

    const nextTokens: TokenState = {};
    const nextErrors: ErrorState = {};
    results.forEach((result, index) => {
      const purpose = ATTENDANCE_PURPOSES[index];
      if (result.status === "fulfilled") {
        nextTokens[purpose] = result.value.token;
        return;
      }
      nextErrors[purpose] =
        result.reason instanceof Error
          ? result.reason.message
          : errorFallback;
    });

    setTokens(nextTokens);
    setErrors(nextErrors);
  }, [contestId, errorFallback]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    if (!contestId) return undefined;
    const timer = window.setTimeout(
      () => void refresh(),
      getProjectionTokenRefreshDelayMs(tokens),
    );
    return () => window.clearTimeout(timer);
  }, [contestId, refresh, tokens]);

  return { tokens, errors };
}

function ExamStatusBlock({ contest }: { contest: ContestDetail | null | undefined }) {
  const { t, i18n } = useTranslation("contest");
  const tr = useCallback<AttendanceTranslate>(
    (key, defaultValue, values) => {
      const translated = values
        ? t(key, { defaultValue, ...values })
        : t(key, defaultValue);
      if (typeof translated === "string") return translated;
      return defaultValue.replace(/{{(\w+)}}/g, (_, name) =>
        String(values?.[name] ?? ""),
      );
    },
    [t],
  );
  const now = useNow();
  const countdown = getCountdown(contest, now, tr);
  const progress = getCountdownProgress(contest, now);
  const shouldShowCurrentMarkerLabel = progress > 18 && progress < 82;
  const currentAlign = progress <= 15 ? "left" : progress >= 85 ? "right" : "center";
  const startDate = formatContestMonthDay(contest?.startTime, i18n.language);
  const startTime = formatContestClockTime(contest?.startTime, i18n.language);
  const endDate = formatContestMonthDay(contest?.endTime, i18n.language);
  const endTime = formatContestClockTime(contest?.endTime, i18n.language);
  return (
    <section className={styles.statusBlock}>
      <div className={styles.examTitleGroup}>
        <div className={styles.blockLabel}>{t("attendance.projection.examLabel", "考試")}</div>
        <h1 className={styles.title}>
          {contest?.name || t("attendance.projection.examFallback", "Exam")}
          <span className={styles.statusChip}>{countdown.tone}</span>
        </h1>
      </div>
      <div className={styles.countdownGroup}>
        <div className={styles.blockLabel}>{countdown.label}</div>
        <div className={styles.countdown}>{countdown.value}</div>
      </div>
      <div className={styles.progressGroup}>
        <div className={styles.progressHeader}>
          <span>{t("attendance.projection.marker.start", "開始")}</span>
          <span>{t("attendance.projection.marker.end", "結束")}</span>
        </div>
        <div
          className={styles.progressScale}
          aria-label={t("attendance.projection.progressAria", "考試進度 {{progress}}%", {
            progress,
          })}
        >
          <div className={styles.progressTrack}>
            <span className={styles.progressFill} style={{ width: `${progress}%` }} />
            <span className={styles.progressDot} data-position="start" aria-hidden="true" />
            <span
              className={styles.progressDot}
              data-position="current"
              style={{ left: `${progress}%` }}
              aria-hidden="true"
            />
            <span className={styles.progressDot} data-position="end" aria-hidden="true" />
          </div>
          <div className={styles.progressMarkers}>
            <span className={styles.progressMarker} data-position="start">
              <strong>{startDate || "--"}</strong>
              <strong>{startTime}</strong>
            </span>
            {shouldShowCurrentMarkerLabel ? (
              <span
                className={styles.progressMarker}
                data-position="current"
                data-align={currentAlign}
                style={{ left: `${progress}%` }}
                aria-label={t("attendance.projection.marker.now", "現在")}
              >
                <strong>{formatContestMonthDay(now, i18n.language)}</strong>
                <strong>{formatContestClockTime(now, i18n.language)}</strong>
              </span>
            ) : null}
            <span className={styles.progressMarker} data-position="end">
              <strong>{endDate || "--"}</strong>
              <strong>{endTime}</strong>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function CheckInGuideBlock() {
  const { t } = useTranslation("contest");
  const guideSteps = [
    {
      icon: QrCode,
      action: t("attendance.projection.guide.scan", "掃描 QR Code"),
    },
    {
      icon: Camera,
      action: t("attendance.projection.guide.photo", "拍攝現場照片"),
    },
    {
      icon: SendAlt,
      action: t("attendance.projection.guide.upload", "確認並上傳"),
    },
  ];
  return (
    <div className={styles.qrGuide} aria-label={t("attendance.projection.guide.ariaLabel", "簽到說明")}>
      {guideSteps.map((step) => {
        const Icon = step.icon;
        return (
          <div className={styles.qrGuideItem} key={step.action}>
            <Icon size={16} />
            <span>{step.action}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function AttendanceProjectionScreen() {
  const { t } = useTranslation("contest");
  const { classroomId, contestId } = useParams();
  const { contest } = useContest();
  const { tokens, errors } = useProjectionTokens(
    contestId,
    t("attendance.projection.refreshFailed", "QR Code 重新載入失敗"),
  );
  const [displayMode, setDisplayMode] = useState<ProjectionDisplayMode>("check_in");
  const [fullscreenActive, setFullscreenActive] = useState(() => isFullscreen());
  const errorMessages = Object.values(errors).filter(Boolean);
  const adminPath = `/classrooms/${classroomId}/contest/${contestId}/admin`;
  const displayModes = [
    { value: "check_in", label: t("attendance.purpose.checkIn", "簽到"), icon: Login },
    { value: "check_out", label: t("attendance.purpose.checkOut", "簽退"), icon: Logout },
  ] satisfies Array<{ value: ProjectionDisplayMode; label: string; icon: typeof Login }>;

  useEffect(() => {
    const syncFullscreen = () => setFullscreenActive(isFullscreen());
    document.addEventListener("fullscreenchange", syncFullscreen);
    document.addEventListener("webkitfullscreenchange", syncFullscreen);
    document.addEventListener("msfullscreenchange", syncFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      document.removeEventListener("webkitfullscreenchange", syncFullscreen);
      document.removeEventListener("msfullscreenchange", syncFullscreen);
    };
  }, []);

  const handleFullscreenToggle = useCallback(async () => {
    const nextActive = fullscreenActive
      ? !(await exitFullscreen())
      : await requestFullscreen();
    setFullscreenActive(nextActive);
  }, [fullscreenActive]);

  const renderQr = (purpose: AttendancePurpose) => {
    const token = tokens[purpose];
    const error = errors[purpose];
    return (
      <section className={styles.qrPanel}>
        <div className={styles.modeSwitch} aria-label={t("attendance.projection.mode.ariaLabel", "切換簽到簽退 QR Code")}>
          {displayModes.map((mode, index) => {
            const Icon = mode.icon;
            return (
              <div className={styles.modeSwitchItem} key={mode.value}>
                <button
                  type="button"
                  className={styles.modeButton}
                  data-active={mode.value === displayMode}
                  aria-pressed={mode.value === displayMode}
                  onClick={() => setDisplayMode(mode.value)}
                >
                  <Icon size={16} />
                  {mode.label}
                </button>
                {index < displayModes.length - 1 ? <span aria-hidden="true">/</span> : null}
              </div>
            );
          })}
        </div>
        <div className={styles.qrBox}>
          {token ? (
            <QRCodeSVG
              value={token.qrValue}
              size={420}
              bgColor="#ffffff"
              fgColor="#000000"
              includeMargin
            />
          ) : (
            <div className={styles.qrPlaceholder}>{t("attendance.projection.loading", "載入中")}</div>
          )}
        </div>
        <div className={styles.manualCodeBlock}>
          <span>{t("attendance.projection.manualCodeLabel", "相機無法使用時輸入代碼")}</span>
          <strong>{token?.manualCode || "------"}</strong>
        </div>
        <CheckInGuideBlock />
        {error ? (
          <div className={styles.panelError}>
            {t("attendance.projection.reloadQr", "正在重新載入 QR code")}
          </div>
        ) : null}
      </section>
    );
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Button
            as={Link}
            to={adminPath}
            kind="ghost"
            hasIconOnly
            className={styles.backButton}
            iconDescription={t("attendance.projection.backToAdmin", "回管理介面")}
            renderIcon={ChevronLeft}
          />
          <div className={styles.navTitle}>
            <span>{contest?.name || t("attendance.projection.examFallback", "Exam")}</span>
            <span>/</span>
            <strong>{t("attendance.projection.title", "考試簽到簽退")}</strong>
          </div>
        </div>
        <div className={styles.headerRight}>
          <Button
            kind="ghost"
            hasIconOnly
            className={styles.backButton}
            iconDescription={
              fullscreenActive
                ? t("attendance.projection.exitFullscreen", "退出全螢幕")
                : t("attendance.projection.enterFullscreen", "進入全螢幕")
            }
            renderIcon={fullscreenActive ? ShrinkScreen : FitToScreen}
            onClick={handleFullscreenToggle}
          />
        </div>
      </header>
      {errorMessages.length > 0 ? (
        <InlineNotification
          kind="error"
          title={t("attendance.projection.unstableTitle", "QR 載入不穩定")}
          subtitle={t(
            "attendance.projection.unstableSubtitle",
            "系統已暫停顯示失效 QR code，並會持續重新載入。",
          )}
          lowContrast
        />
      ) : null}
      <div className={styles.body}>
        <div className={styles.leftPanel}>
          <ExamStatusBlock contest={contest} />
        </div>
        <div className={styles.qrGrid} data-mode={displayMode}>
          {renderQr(displayMode)}
        </div>
      </div>
    </main>
  );
}
