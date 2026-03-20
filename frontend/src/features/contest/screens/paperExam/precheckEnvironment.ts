import type React from "react";
import type { TFunction } from "i18next";
import {
  CheckmarkFilled,
  ErrorFilled,
  InProgress,
  Time,
  WarningAlt,
} from "@carbon/icons-react";

import { requestFullscreen, isFullscreen } from "@/core/usecases/exam";
import { DisplayCheckService } from "@/features/contest/detectors/displayCheckService";
import {
  clearPrecheckScreenShareHandoff,
  peekPrecheckScreenShareHandoff,
} from "@/features/contest/anticheat/screenShareHandoffStore";
import {
  clearPrecheckWebcamHandoff,
  peekPrecheckWebcamHandoff,
} from "@/features/contest/anticheat/webcamHandoffStore";
import { isStreamLive, isStreamHealthy } from "@/features/contest/anticheat/mediaStreamHealth";

type TranslateFn = TFunction;

export type CheckStatus = "pending" | "running" | "pass" | "fail" | "blocked";

export interface CheckItem {
  id: string;
  label: string;
  status: CheckStatus;
  detail?: string;
}

export type EnvCheckId =
  | "singleMonitor"
  | "shareScreen"
  | "webcam"
  | "fullscreen"
  | "interaction";

export interface PreflightValidationFailure {
  checkId: EnvCheckId;
  detail: string;
  clearShareHandoff?: boolean;
  clearWebcamHandoff?: boolean;
}

export const PRECHECK_RECENT_INTERACTION_WINDOW_MS = 30000;

const ENV_CHECK_ORDER: EnvCheckId[] = [
  "singleMonitor",
  "shareScreen",
  "webcam",
  "fullscreen",
  "interaction",
];

const PRECHECK_FULLSCREEN_TIMEOUT_MS = 4000;
const PRECHECK_SHARE_RECHECK_DELAY_MS = 350;
const PRECHECK_MIN_RUNNING_MS = 1000;

const withTimeout = async <T,>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

const displayService = new DisplayCheckService();

export const createEligibilityChecks = (t: TranslateFn): CheckItem[] => [
  { id: "participation", label: t("precheck.eligibility.participation"), status: "pending" },
  { id: "submitted", label: t("precheck.eligibility.submission"), status: "pending" },
];

export interface EnvironmentCheckFilter {
  requireScreenShare: boolean;
  enableWebcam: boolean;
  requirePwaMode: boolean;
  skipFullscreen: boolean;
}

export const createEnvironmentChecks = (
  t: TranslateFn,
  filter?: EnvironmentCheckFilter
): CheckItem[] => {
  const checks: CheckItem[] = [];
  if (!filter || filter.requireScreenShare) {
    checks.push(
      { id: "singleMonitor", label: t("precheck.environment.checks.monitor"), status: "pending" },
      { id: "shareScreen", label: t("precheck.environment.checks.sharing"), status: "pending" },
    );
  }
  if (!filter || filter.enableWebcam) {
    checks.push({ id: "webcam", label: t("precheck.environment.checks.webcam", "Webcam"), status: "pending" });
  }
  if (!filter || !filter.skipFullscreen || filter.requirePwaMode) {
    checks.push({ id: "fullscreen", label: t("precheck.environment.checks.fullscreen"), status: "pending" });
  }
  checks.push({ id: "interaction", label: t("precheck.environment.checks.interaction"), status: "pending" });
  return checks;
};

export const createStatusMeta = (t: TranslateFn): Record<
  CheckStatus,
  { label: string; color: string; Icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }> }
> => ({
  pending: {
    label: t("common:status.pending"),
    color: "var(--cds-text-secondary)",
    Icon: Time,
  },
  running: {
    label: t("precheck.environment.status.checking"),
    color: "var(--cds-support-info)",
    Icon: InProgress,
  },
  pass: {
    label: t("common:status.success"),
    color: "var(--cds-support-success)",
    Icon: CheckmarkFilled,
  },
  fail: {
    label: t("common:status.failed"),
    color: "var(--cds-support-error)",
    Icon: ErrorFilled,
  },
  blocked: {
    label: t("common:status.notPassed"),
    color: "var(--cds-support-warning)",
    Icon: WarningAlt,
  },
});

export const updateCheck = (
  setter: React.Dispatch<React.SetStateAction<CheckItem[]>>,
  id: string,
  status: CheckStatus,
  detail?: string
) => {
  setter((prev) =>
    prev.map((item) => (item.id === id ? { ...item, status, detail } : item))
  );
};

export const applyPreflightFailureToEnvChecks = (
  failure: PreflightValidationFailure,
  setEnvChecks: React.Dispatch<React.SetStateAction<CheckItem[]>>,
  setEnvTestDone: React.Dispatch<React.SetStateAction<boolean>>,
  setEnvTestRunning: React.Dispatch<React.SetStateAction<boolean>>,
  t: TranslateFn
) => {
  const failureIndex = ENV_CHECK_ORDER.indexOf(failure.checkId);
  if (failureIndex < 0) return;

  setEnvChecks((prev) =>
    prev.map((item) => {
      const itemId = item.id as EnvCheckId;
      const idx = ENV_CHECK_ORDER.indexOf(itemId);
      if (idx === failureIndex) {
        return {
          ...item,
          status: "fail" as const,
          detail: failure.detail,
        };
      }
      if (idx > failureIndex) {
        const depName = failure.checkId === "singleMonitor"
          ? t("precheck.environment.checks.monitor")
          : failure.checkId === "shareScreen"
            ? t("precheck.environment.checks.sharing")
            : failure.checkId === "webcam"
              ? t("precheck.environment.checks.webcam", "Webcam")
            : failure.checkId === "fullscreen"
              ? t("precheck.environment.checks.fullscreen")
              : t("precheck.environment.checks.interaction");
        return {
          ...item,
          status: "blocked" as const,
          detail: t("precheck.environment.errors.dependencyPrefix", { name: depName }),
        };
      }
      return item;
    })
  );
  setEnvTestDone(true);
  setEnvTestRunning(false);
  if (failure.clearShareHandoff) {
    clearPrecheckScreenShareHandoff(true);
  }
  if (failure.clearWebcamHandoff) {
    clearPrecheckWebcamHandoff(true);
  }
};

export const runStartPreflightValidation = async (
  t: TranslateFn,
  options: {
    requireScreenShare: boolean;
    requireWebcam: boolean;
    enableWebcam?: boolean;
    requirePwaOnTablet: boolean;
    isPwaMode: boolean;
    skipFullscreenCheck: boolean;
  }
): Promise<PreflightValidationFailure | null> => {
  const {
    requireScreenShare,
    requireWebcam,
    enableWebcam,
    requirePwaOnTablet,
    isPwaMode,
    skipFullscreenCheck,
  } = options;
  if (requireScreenShare) {
    const diagnostics = await displayService.check();
    if (!diagnostics.supportsScreenDetails) {
      return {
        checkId: "singleMonitor",
        detail: t("precheck.environment.errors.browserNotSupported"),
        clearShareHandoff: true,
      };
    }
    if (diagnostics.screenCount === null) {
      return {
        checkId: "singleMonitor",
        detail: t("precheck.environment.errors.noScreenDetails"),
        clearShareHandoff: true,
      };
    }
    if (diagnostics.isExtended || diagnostics.screenCount > 1) {
      return {
        checkId: "singleMonitor",
        detail: t("precheck.environment.errors.multiMonitor", { count: diagnostics.screenCount }),
        clearShareHandoff: true,
      };
    }

    const handoffStream = peekPrecheckScreenShareHandoff();
    if (!handoffStream) {
      return {
        checkId: "shareScreen",
        detail: t("precheck.environment.errors.sharingInterrupted"),
        clearShareHandoff: true,
      };
    }
    if (!isStreamLive(handoffStream)) {
      return {
        checkId: "shareScreen",
        detail: t("precheck.environment.errors.sharingInterrupted"),
        clearShareHandoff: true,
      };
    }
    const screenTrack = handoffStream.getVideoTracks()[0];
    const settings = (screenTrack?.getSettings?.() || {}) as MediaTrackSettings & { displaySurface?: string };
    if (settings.displaySurface !== "monitor") {
      return {
        checkId: "shareScreen",
        detail: t("precheck.environment.errors.notMonitor"),
        clearShareHandoff: true,
      };
    }
  }

  if (requireWebcam || enableWebcam) {
    const handoffWebcam = peekPrecheckWebcamHandoff();
    if (!isStreamHealthy(handoffWebcam)) {
      return {
        checkId: "webcam",
        detail: t("precheck.environment.errors.webcamFailed", "Webcam 無法使用，請重新授權。"),
        clearWebcamHandoff: true,
      };
    }
  }

  if (requirePwaOnTablet && !isPwaMode) {
    return {
      checkId: "fullscreen",
      detail: t(
        "precheck.environment.errors.tabletRequiresPwa",
        "iPad 監考需使用 PWA 模式。請先將系統加入主畫面，並從主畫面開啟後重試。"
      ),
    };
  }

  if (!skipFullscreenCheck && !isFullscreen()) {
    return {
      checkId: "fullscreen",
      detail: t("precheck.environment.errors.fullscreenFailed"),
    };
  }

  return null;
};

interface RunEnvChecksOptions {
  t: TranslateFn;
  envTestRunning: boolean;
  requireScreenShare: boolean;
  requireWebcam: boolean;
  enableWebcam: boolean;
  requirePwaOnTablet: boolean;
  isPwaMode: boolean;
  skipFullscreenCheck: boolean;
  checkFilter?: EnvironmentCheckFilter;
  requestMonitorScreenShare: () => Promise<{
    granted: boolean;
    displaySurface: string | null;
    detail: string;
  }>;
  requestWebcamCapture: () => Promise<{
    granted: boolean;
    detail: string;
  }>;
  lastInteractionAt: number;
  setStartGuardError: React.Dispatch<React.SetStateAction<string | null>>;
  setEnvChecks: React.Dispatch<React.SetStateAction<CheckItem[]>>;
  setEnvTestDone: React.Dispatch<React.SetStateAction<boolean>>;
  setEnvTestRunning: React.Dispatch<React.SetStateAction<boolean>>;
}

export const runEnvChecks = async ({
  t,
  envTestRunning,
  requireScreenShare,
  requireWebcam,
  enableWebcam,
  requirePwaOnTablet,
  isPwaMode,
  skipFullscreenCheck,
  checkFilter,
  requestMonitorScreenShare,
  requestWebcamCapture,
  lastInteractionAt,
  setStartGuardError,
  setEnvChecks,
  setEnvTestDone,
  setEnvTestRunning,
}: RunEnvChecksOptions) => {
  if (envTestRunning) return;
  setStartGuardError(null);
  setEnvTestRunning(true);
  setEnvChecks(createEnvironmentChecks(t, checkFilter));
  setEnvTestDone(false);

  const runningAt = new Map<string, number>();
  const markRunning = (id: string, detail?: string) => {
    runningAt.set(id, Date.now());
    updateCheck(setEnvChecks, id, "running", detail);
  };
  const finalizeCheck = async (
    id: string,
    status: Exclude<CheckStatus, "pending" | "running">,
    detail?: string
  ) => {
    const startedAt = runningAt.get(id);
    if (startedAt) {
      const elapsed = Date.now() - startedAt;
      const remain = PRECHECK_MIN_RUNNING_MS - elapsed;
      if (remain > 0) await sleep(remain);
    }
    runningAt.delete(id);
    updateCheck(setEnvChecks, id, status, detail);
  };
  const markBlocked = (id: string, detail: string) => {
    updateCheck(setEnvChecks, id, "blocked", detail);
  };
  const failShareAndBlock = async (detail: string) => {
    await finalizeCheck("shareScreen", "fail", detail);
    const depMsg = t("precheck.environment.errors.dependencyPrefix", {
      name: t("precheck.environment.checks.sharing"),
    });
    markBlocked("fullscreen", depMsg);
    markBlocked("interaction", depMsg);
    clearPrecheckScreenShareHandoff(true);
  };
  const blockRemainingAfterSingleMonitor = () => {
    const depMsg = t("precheck.environment.errors.dependencyPrefix", {
      name: t("precheck.environment.checks.monitor"),
    });
    if (requireScreenShare) {
      markBlocked("shareScreen", depMsg);
    }
    if (enableWebcam) {
      markBlocked("webcam", depMsg);
    }
    markBlocked("fullscreen", depMsg);
    markBlocked("interaction", depMsg);
    clearPrecheckScreenShareHandoff(true);
    clearPrecheckWebcamHandoff(true);
  };

  try {
    if (requireScreenShare) {
      markRunning("singleMonitor", t("precheck.environment.status.checking"));
      const diagnostics = await displayService.check();

      if (!diagnostics.supportsScreenDetails) {
        await finalizeCheck("singleMonitor", "fail", t("precheck.environment.errors.browserNotSupported"));
        blockRemainingAfterSingleMonitor();
        return;
      }

      if (diagnostics.screenCount === null) {
        await finalizeCheck("singleMonitor", "fail", t("precheck.environment.errors.noScreenDetails"));
        blockRemainingAfterSingleMonitor();
        return;
      }

      if (diagnostics.isExtended || diagnostics.screenCount > 1) {
        await finalizeCheck(
          "singleMonitor",
          "fail",
          t("precheck.environment.errors.multiMonitor", { count: diagnostics.screenCount })
        );
        blockRemainingAfterSingleMonitor();
        return;
      }

      await finalizeCheck("singleMonitor", "pass", t("precheck.eligibility.status.passed"));

      markRunning("shareScreen", t("precheck.environment.requirements.sharing"));
      const shareResult = await requestMonitorScreenShare();
      if (!shareResult.granted) {
        await failShareAndBlock(shareResult.detail);
        return;
      }

      await sleep(PRECHECK_SHARE_RECHECK_DELAY_MS);
      const diagnosticsAfterShare = await displayService.check();
      if (diagnosticsAfterShare.screenCount === null) {
        await failShareAndBlock(t("precheck.environment.errors.noScreenDetails"));
        return;
      }
      if (diagnosticsAfterShare.isExtended || diagnosticsAfterShare.screenCount > 1) {
        await failShareAndBlock(
          t("precheck.environment.errors.multiMonitor", { count: diagnosticsAfterShare.screenCount })
        );
        return;
      }

      if (shareResult.displaySurface !== "monitor") {
        await failShareAndBlock(t("precheck.environment.errors.notMonitor"));
        return;
      }
      await finalizeCheck("shareScreen", "pass", t("precheck.environment.checks.sharing"));
    } else {
      clearPrecheckScreenShareHandoff(true);
    }

    if (enableWebcam) {
      markRunning("webcam", t("precheck.environment.checks.webcam", "Webcam"));
      const webcamResult = await requestWebcamCapture();
      if (!webcamResult.granted && requireWebcam) {
        await finalizeCheck("webcam", "fail", webcamResult.detail);
        const depMsg = t("precheck.environment.errors.dependencyPrefix", {
          name: t("precheck.environment.checks.webcam", "Webcam"),
        });
        markBlocked("fullscreen", depMsg);
        markBlocked("interaction", depMsg);
        clearPrecheckWebcamHandoff(true);
        return;
      }
      if (!webcamResult.granted) {
        await finalizeCheck(
          "webcam",
          "pass",
          t("precheck.environment.status.optionalSkipped", "Webcam 未啟用（可選）")
        );
      } else {
        await finalizeCheck("webcam", "pass", t("precheck.environment.checks.webcam", "Webcam"));
      }
    } else {
      clearPrecheckWebcamHandoff(true);
    }

    if (requirePwaOnTablet && !isPwaMode) {
      markRunning("fullscreen", t("precheck.environment.status.checking"));
      await finalizeCheck(
        "fullscreen",
        "fail",
        t(
          "precheck.environment.errors.tabletRequiresPwa",
          "iPad 監考需使用 PWA 模式。請先將系統加入主畫面，並從主畫面開啟後重試。"
        )
      );
      const depMsg = t("precheck.environment.errors.dependencyPrefix", {
        name: t("precheck.environment.checks.fullscreen"),
      });
      markBlocked("interaction", depMsg);
      return;
    }

    if (skipFullscreenCheck) {
      updateCheck(
        setEnvChecks,
        "fullscreen",
        "pass",
        t("precheck.environment.status.pwaFullscreenBypass", "PWA 模式：已略過全螢幕檢查")
      );
    } else {
      markRunning("fullscreen", t("precheck.environment.status.checking"));
      try {
        const enteredFullscreen = await withTimeout(
          requestFullscreen(),
          PRECHECK_FULLSCREEN_TIMEOUT_MS,
          "requestFullscreen timeout"
        );
        if (enteredFullscreen && isFullscreen()) {
          await finalizeCheck("fullscreen", "pass", t("common:status.success"));
        } else {
          await finalizeCheck("fullscreen", "fail", t("precheck.environment.errors.fullscreenFailed"));
          const depMsg = t("precheck.environment.errors.dependencyPrefix", {
            name: t("precheck.environment.checks.fullscreen"),
          });
          markBlocked("interaction", depMsg);
          return;
        }
      } catch {
        await finalizeCheck("fullscreen", "fail", t("precheck.environment.errors.fullscreenTimeout"));
        const depMsg = t("precheck.environment.errors.dependencyPrefix", {
          name: t("precheck.environment.checks.fullscreen"),
        });
        markBlocked("interaction", depMsg);
        return;
      }
    }

    markRunning("interaction", t("precheck.environment.status.checking"));
    const hasRecentInput =
      Date.now() - lastInteractionAt <= PRECHECK_RECENT_INTERACTION_WINDOW_MS;
    if (!document.hasFocus()) {
      await finalizeCheck("interaction", "fail", t("precheck.environment.errors.focusFailed"));
      return;
    }
    if (!hasRecentInput) {
      await finalizeCheck("interaction", "fail", t("precheck.environment.errors.interactionFailed"));
      return;
    }
    await finalizeCheck("interaction", "pass", t("common:status.success"));
  } finally {
    setEnvTestDone(true);
    setEnvTestRunning(false);
  }
};
