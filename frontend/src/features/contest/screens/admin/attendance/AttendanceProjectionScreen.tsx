import { useCallback, useEffect, useState } from "react";
import { Camera, ChevronLeft, FitToScreen, QrCode, SendAlt, ShrinkScreen } from "@carbon/icons-react";
import { QRCodeSVG } from "@rc-component/qrcode";
import { Button, ContentSwitcher, InlineNotification, Switch } from "@carbon/react";
import { Link, useParams } from "react-router";

import type { AttendancePurpose, ContestDetail } from "@/core/entities/contest.entity";
import { exitFullscreen, isFullscreen, requestFullscreen } from "@/core/usecases/exam";
import { getAttendanceQrToken, type AttendanceQrToken } from "@/infrastructure/api/repositories/attendance.repository";
import { useContest } from "@/features/contest/contexts/ContestContext";
import styles from "./AttendanceProjectionScreen.module.scss";

type TokenState = Partial<Record<AttendancePurpose, AttendanceQrToken>>;
type ErrorState = Partial<Record<AttendancePurpose, string>>;
type ProjectionDisplayMode = AttendancePurpose;

const ATTENDANCE_PURPOSES: AttendancePurpose[] = ["check_in", "check_out"];

const PURPOSE_LABEL: Record<AttendancePurpose, string> = {
  check_in: "簽到 QR",
  check_out: "簽退 QR",
};

const DISPLAY_MODES: Array<{ value: ProjectionDisplayMode; label: string }> = [
  { value: "check_in", label: "簽到" },
  { value: "check_out", label: "簽退" },
];

function formatDateTime(value: string | undefined): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

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
): { label: string; value: string; tone: string } {
  const { start, end } = getExamWindow(contest);
  if (start == null || end == null) {
    return { label: "考試倒數", value: "--:--:--", tone: "未設定時間" };
  }
  if (now < start) {
    return { label: "距離開始", value: formatDuration(start - now), tone: "開放簽到" };
  }
  if (now < end) {
    return { label: "距離截止", value: formatDuration(end - now), tone: "考試進行中" };
  }
  return { label: "考試已結束", value: "00:00:00", tone: "已結束" };
}

function getCountdownProgress(contest: ContestDetail | null | undefined, now: number): number {
  const { start, end } = getExamWindow(contest);
  if (start == null || end == null || end <= start) return 0;
  if (now <= start) return 0;
  if (now >= end) return 100;
  return Math.round(((now - start) / (end - start)) * 100);
}

function getTotalDuration(contest: ContestDetail | null | undefined): string {
  const { start, end } = getExamWindow(contest);
  if (start == null || end == null || end <= start) return "--";
  return formatDuration(end - start);
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function useProjectionTokens(contestId: string | undefined) {
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
          : "Failed to refresh QR code";
    });

    setTokens((current) => ({ ...current, ...nextTokens }));
    setErrors(nextErrors);
  }, [contestId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const refreshSeconds = tokens.check_in?.refreshAfterSeconds || 30;
    const timer = window.setInterval(() => void refresh(), refreshSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [refresh, tokens.check_in?.refreshAfterSeconds]);

  return { tokens, errors };
}

function ContestInfoBlock({ contest }: { contest: ContestDetail | null | undefined }) {
  const rows = [
    ["開始時間", formatDateTime(contest?.startTime) || "--"],
    ["截止時間", formatDateTime(contest?.endTime) || "--"],
    ["總時長", getTotalDuration(contest)],
    ["考試類型", contest?.contestType === "paper_exam" ? "考卷" : "程式競賽"],
  ];

  return (
    <section className={styles.block}>
      <div className={styles.blockLabel}>競賽資訊</div>
      <h1 className={styles.title}>{contest?.name || "Exam"}</h1>
      {contest?.description ? <p className={styles.description}>{contest.description}</p> : null}
      <div className={styles.infoGrid}>
        {rows.map(([label, value]) => (
          <div className={styles.infoItem} key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function CountdownBlock({ contest }: { contest: ContestDetail | null | undefined }) {
  const now = useNow();
  const countdown = getCountdown(contest, now);
  const progress = getCountdownProgress(contest, now);
  return (
    <section className={styles.countdownBlock}>
      <div className={styles.countdownMain}>
        <div className={styles.countdownRow}>
          <div>
            <div className={styles.blockLabel}>{countdown.label}</div>
            <div className={styles.countdown}>{countdown.value}</div>
          </div>
          <div className={styles.countdownTone}>{countdown.tone}</div>
        </div>
        <div className={styles.progressTrack} aria-label={`考試進度 ${progress}%`}>
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>
    </section>
  );
}

const GUIDE_STEPS = [
  {
    icon: QrCode,
    action: "掃描 QR Code",
  },
  {
    icon: Camera,
    action: "拍攝現場照片",
  },
  {
    icon: SendAlt,
    action: "確認並上傳",
  },
];

function CheckInGuideBlock() {
  return (
    <div className={styles.qrGuide} aria-label="簽到說明">
      {GUIDE_STEPS.map((step) => {
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
  const { classroomId, contestId } = useParams();
  const { contest } = useContest();
  const { tokens, errors } = useProjectionTokens(contestId);
  const [displayMode, setDisplayMode] = useState<ProjectionDisplayMode>("check_in");
  const [fullscreenActive, setFullscreenActive] = useState(() => isFullscreen());
  const errorMessages = Object.values(errors).filter(Boolean);
  const adminPath = `/classrooms/${classroomId}/contest/${contestId}/admin`;

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
        <div className={styles.qrHeader}>
          <div className={styles.purpose}>{PURPOSE_LABEL[purpose]}</div>
          <div className={styles.qrHint}>
            {purpose === "check_in" ? "考試前掃描" : "交卷後掃描"}
          </div>
        </div>
        <div className={styles.qrBox}>
          {token ? <QRCodeSVG value={token.qrValue} size={420} /> : <div className={styles.qrPlaceholder}>Loading</div>}
        </div>
        <div className={styles.manualCodeBlock}>
          <span>相機無法使用時輸入代碼</span>
          <strong>{token?.manualCode || "---- ----"}</strong>
        </div>
        <CheckInGuideBlock />
        <div className={styles.timer}>每 {token?.refreshAfterSeconds || 30} 秒自動刷新</div>
        {error ? <div className={styles.panelError}>正在重新載入 QR code</div> : null}
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
            iconDescription="回管理介面"
            renderIcon={ChevronLeft}
          />
          <Button
            kind="ghost"
            hasIconOnly
            className={styles.backButton}
            iconDescription={fullscreenActive ? "退出全螢幕" : "進入全螢幕"}
            renderIcon={fullscreenActive ? ShrinkScreen : FitToScreen}
            onClick={handleFullscreenToggle}
          />
          <div className={styles.navTitle}>
            <span>{contest?.name || "Exam"}</span>
            <span>/</span>
            <strong>考試簽到簽退</strong>
          </div>
        </div>
        <div className={styles.headerRight}>
          <ContentSwitcher
            selectedIndex={DISPLAY_MODES.findIndex((mode) => mode.value === displayMode)}
            size="md"
            onChange={(event) => {
              const nextMode = typeof event.index === "number"
                ? DISPLAY_MODES[event.index]?.value
                : undefined;
              if (nextMode) setDisplayMode(nextMode);
            }}
          >
            {DISPLAY_MODES.map((mode) => (
              <Switch key={mode.value} name={mode.value} text={mode.label} />
            ))}
          </ContentSwitcher>
        </div>
      </header>
      {errorMessages.length > 0 ? (
        <InlineNotification
          kind="error"
          title="QR 載入不穩定"
          subtitle="系統會自動保留上一組可用 QR code 並持續重新載入。"
          lowContrast
        />
      ) : null}
      <div className={styles.body}>
        <div className={styles.leftPanel}>
          <ContestInfoBlock contest={contest} />
          <CountdownBlock contest={contest} />
        </div>
        <div className={styles.qrGrid} data-mode={displayMode}>
          {renderQr(displayMode)}
        </div>
      </div>
    </main>
  );
}
