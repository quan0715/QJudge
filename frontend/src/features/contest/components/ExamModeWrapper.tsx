import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import type { ReactNode } from "react";
import type { ExamStatusType } from "@/core/entities/contest.entity";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { ExamOverlays } from "@/features/contest/components/exam/ExamOverlays";
import { ExamModals } from "@/features/contest/components/exam/ExamModals";
import { useExamState } from "@/features/contest/hooks/useExamState";
import { useExamMonitoring } from "@/features/contest/hooks/useExamMonitoring";
import { getClassroomContestDashboardPath } from "@/features/contest/domain/contestRoutePolicy";
import { useToast } from "@/shared/contexts/ToastContext";
import { createFullscreenAdapter } from "@/features/contest/anticheat/fullscreenAdapter";
import {
  syncAnticheatPhaseWithExamStatus,
  resetAnticheatOrchestrator,
} from "@/features/contest/anticheat/orchestrator";
import { hasExamPrecheckPassed } from "@/features/contest/screens/paperExam/hooks";
import { useAnticheatScreenCapture } from "@/features/contest/screens/paperExam/hooks/useAnticheatScreenCapture";
import { useAnticheatWebcamCapture } from "@/features/contest/screens/paperExam/hooks/useAnticheatWebcamCapture";
import { ExamCaptureProvider } from "@/features/contest/contexts/ExamCaptureContext";
import {
  ExamMonitoringStatusProvider,
  type ExamMonitoringReminder,
} from "@/features/contest/contexts/ExamMonitoringStatusContext";
import { createStreamAdapter } from "@/features/contest/anticheat/streamAdapter";
import {
  setRuntimeScreenShareHandoff,
  clearPrecheckScreenShareHandoff,
  clearRuntimeScreenShareHandoff,
} from "@/features/contest/anticheat/screenShareHandoffStore";
import { setRuntimeWebcamHandoff } from "@/features/contest/anticheat/webcamHandoffStore";
import {
  requestUserMediaVideo,
  supportsUserMediaApi,
} from "@/features/contest/anticheat/mediaApi";
import { isStreamHealthy } from "@/features/contest/anticheat/mediaStreamHealth";
import { useContestAnticheatConfig } from "@/features/contest/hooks/useContestAnticheatConfig";
import { useTranslation } from "react-i18next";
import { stopCaptureForContest } from "@/features/contest/anticheat/captureLifecycle";
import {
  detectAnticheatCapability,
  resolveDeviceMonitoringPlan,
} from "@/features/contest/domain/anticheatModulePolicy";
import { useViewportMonitoring } from "@/features/contest/hooks/useViewportMonitoring";
import { useWebcamMonitoring } from "@/features/contest/hooks/useWebcamMonitoring";
import { useScreenShareMonitoring } from "@/features/contest/hooks/useScreenShareMonitoring";
import { useFullscreenMonitoring } from "@/features/contest/hooks/useFullscreenMonitoring";
import { useMouseLeaveMonitoring } from "@/features/contest/hooks/useMouseLeaveMonitoring";
import { useMultiDisplayMonitoring } from "@/features/contest/hooks/useMultiDisplayMonitoring";
import { IntegrityRuntimeProvider } from "@/features/contest/anticheat/integrity/IntegrityRuntimeContext";
import { useIntegrityRuntime } from "@/features/contest/anticheat/integrity/useIntegrityRuntime";
import { useIntegrityCaptureRegistration, useIntegrityUploadOwner } from "../contexts/IntegrityUploadProvider";
import type { IntegrityCaptureState } from "@/core/entities/examIntegrity.entity";

interface ExamModeWrapperProps {
  contestId: string;
  cheatDetectionEnabled: boolean;
  isExamMonitored: boolean;
  requiresFullscreen: boolean;
  hasEnded?: boolean;
  lockReason?: string;
  examStatus?: ExamStatusType;
  onRefresh?: () => Promise<void>;
  children: ReactNode;
}

const isMonitoredStatus = (status?: ExamStatusType) =>
  status === "in_progress" || status === "paused" || status === "locked";

export const isIntegrityAttemptActive = (status?: ExamStatusType) =>
  isMonitoredStatus(status);

/**
 * The Backend is the authority for whether it will accept integrity batches.
 * Keep the frozen policy/run available while a browser is carrying a stale
 * submitted attempt so a permitted rejoin can resume the same run.
 */
export const requiresAnticheatPolicyConfig = (
  cheatDetectionEnabled: boolean,
): boolean => cheatDetectionEnabled;

const ExamModeWrapper: React.FC<ExamModeWrapperProps> = ({
  contestId,
  cheatDetectionEnabled,
  isExamMonitored,
  requiresFullscreen,
  hasEnded = false,
  lockReason,
  examStatus,
  onRefresh,
  children,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { classroomId } = useParams<{ classroomId?: string }>();
  const containerRef = useRef<HTMLDivElement>(null);
  const lastBlockedActionToastAt = useRef<number>(0);
  const lastAllowedExamPathRef = useRef<string | null>(null);
  const [fullscreenAdapter] = useState(createFullscreenAdapter);
  const { showToast } = useToast();
  const [streamAdapter] = useState(createStreamAdapter);
  const uploadOwner = useIntegrityUploadOwner();
  const { t } = useTranslation("contest");
  const policyConfigRequired = requiresAnticheatPolicyConfig(cheatDetectionEnabled);
  const policyRequired =
    policyConfigRequired && (isExamMonitored || isMonitoredStatus(examStatus));
  const {
    config: anticheatConfig,
    loading: anticheatConfigLoading,
    refresh: refreshAnticheatConfig,
  } = useContestAnticheatConfig(policyConfigRequired ? contestId : undefined);
  const capability = detectAnticheatCapability();
  const monitoringPlan = resolveDeviceMonitoringPlan(
    capability,
    anticheatConfig?.integrityRun?.devicePolicy ?? anticheatConfig?.devicePolicy,
  );
  const primarySourceModule = monitoringPlan.primarySourceModule;
  const effectiveRequiresFullscreen =
    requiresFullscreen && monitoringPlan.precheck.requireFullscreen;
  const screenModuleRole =
    monitoringPlan.sources.screenShare.role ?? "secondary";
  const webcamModuleRole = monitoringPlan.sources.webcam.role ?? "secondary";
  const policyConfigMissing =
    policyRequired && !anticheatConfigLoading && !anticheatConfig;
  const policyDeviceUnavailable =
    policyRequired &&
    !anticheatConfigLoading &&
    !!anticheatConfig &&
    !monitoringPlan.allowed;
  const policyUnavailable = policyConfigMissing || policyDeviceUnavailable;
  const effectiveMonitoringEnabled =
    policyRequired && !!anticheatConfig && !policyUnavailable;
  const pwaGuardFailed =
    effectiveMonitoringEnabled &&
    monitoringPlan.precheck.requirePwaMode &&
    !capability.isPwaMode;

  const {
    examState,
    showUnlockNotification,
    handleUnlockContinue,
  } = useExamState({
    contestId,
    examStatus,
    isExamMonitored: effectiveMonitoringEnabled,
    lockReason,
    isBypassed: false,
    requestFullscreen: fullscreenAdapter.request,
  });

  const precheckPassed = contestId ? hasExamPrecheckPassed(contestId) : false;
  const shouldMonitorActiveExam = isMonitoredStatus(examStatus);
  const screenCaptureEnabled =
    effectiveMonitoringEnabled &&
    shouldMonitorActiveExam &&
    precheckPassed &&
    monitoringPlan.runtime.enableScreenShareCapture;
  const webcamCaptureEnabled =
    effectiveMonitoringEnabled &&
    shouldMonitorActiveExam &&
    precheckPassed &&
    monitoringPlan.runtime.enableWebcamCapture;
  const viewportMonitorEnabled =
    effectiveMonitoringEnabled &&
    shouldMonitorActiveExam &&
    precheckPassed &&
    monitoringPlan.runtime.enableViewportIntegrity;
  const captureSnapshotRef = useRef<{
    screenCapture: IntegrityCaptureState;
    webcamCapture: IntegrityCaptureState;
  }>({
    screenCapture: "disabled",
    webcamCapture: "disabled",
  });
  const integrityRuntimeEnabled =
    policyConfigRequired &&
    isIntegrityAttemptActive(examStatus) &&
    anticheatConfig?.version === 3 &&
    (uploadOwner?.resident || anticheatConfig.integrityRun?.computeState === "running") &&
    !!anticheatConfig.integrityRun &&
    anticheatConfig.integrityRun.participantId !== null &&
    anticheatConfig.integrityRun.participantId !== undefined &&
    !!anticheatConfig.integrityRun.policySnapshot &&
    !!anticheatConfig.integrityRun.registrySnapshot;
  const streamMonitorEnabled = effectiveMonitoringEnabled && shouldMonitorActiveExam;
  const screenStreamMonitorEnabled =
    streamMonitorEnabled && monitoringPlan.runtime.monitorScreenShareStream;
  const webcamStreamMonitorEnabled =
    streamMonitorEnabled && monitoringPlan.runtime.monitorWebcamStream;
  const lockedFullscreenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const isAnsweringPath = useCallback(() => {
    const contestBasePath = classroomId
      ? getClassroomContestDashboardPath(classroomId, contestId)
      : null;
    if (!contestBasePath) return false;
    const normalizedPath = location.pathname.replace(/\/+$/, "");
    return (
      normalizedPath === `${contestBasePath}/solve` ||
      normalizedPath.startsWith(`${contestBasePath}/solve/`)
    );
  }, [classroomId, contestId, location.pathname]);

  // When config refreshes and screen share is no longer required, discard any
  // lingering precheck/runtime handoff streams so they don't trigger "螢幕分享已中斷"
  // the next time the stream lifecycle runs.
  useEffect(() => {
    if (!monitoringPlan.runtime.monitorScreenShareStream) {
      clearPrecheckScreenShareHandoff(true);
      clearRuntimeScreenShareHandoff(true);
    }
  }, [monitoringPlan.runtime.monitorScreenShareStream]);

  const capture = useAnticheatScreenCapture({
    contestId,
    enabled: screenCaptureEnabled,
    monitorStream: screenStreamMonitorEnabled,
    preserveStreamOnUnmount:
      cheatDetectionEnabled && examStatus !== "submitted" && !hasEnded,
    expectInitialStream:
      precheckPassed &&
      examStatus === "in_progress" &&
      monitoringPlan.precheck.requireScreenShare,
    onScreenShareLost: () => {
      screenShare.onStreamLost();
    },
  });
  const webcamCapture = useAnticheatWebcamCapture({
    contestId,
    enabled: webcamCaptureEnabled,
    monitorStream: webcamStreamMonitorEnabled,
    preserveStreamOnUnmount:
      cheatDetectionEnabled && examStatus !== "submitted" && !hasEnded,
    expectInitialStream:
      precheckPassed &&
      examStatus === "in_progress" &&
      monitoringPlan.precheck.enableWebcam,
    autoAcquireOnStart: false,
    publishLiveStream: webcamStreamMonitorEnabled,
    onWebcamLost: () => {
      webcam.onStreamLost();
    },
  });
  const { forceStopCapture } = capture;
  const { forceStopCapture: forceStopWebcamCapture } = webcamCapture;
  useEffect(() => {
    captureSnapshotRef.current.screenCapture = screenCaptureEnabled
      ? (capture.streamActive ? "active" : "inactive")
      : "disabled";
  }, [capture.streamActive, screenCaptureEnabled]);
  useEffect(() => {
    captureSnapshotRef.current.webcamCapture = webcamCaptureEnabled
      ? (webcamCapture.streamActive ? "active" : "inactive")
      : "disabled";
  }, [webcamCapture.streamActive, webcamCaptureEnabled]);
  const evidenceCoordinatorRef = useRef<{ flushPendingUploads: () => Promise<void> } | null>(null);
  const setEvidenceCoordinator = useCallback((controller: { flushPendingUploads: () => Promise<void> } | null) => {
    evidenceCoordinatorRef.current = controller;
  }, []);
  const runtimeOptions = {
    enabled: integrityRuntimeEnabled,
    contestId,
    integrityRun: anticheatConfig?.integrityRun,
    snapshotProvider: () => ({
      pageVisible: typeof document === "undefined" || document.visibilityState !== "hidden",
      online: typeof navigator === "undefined" || navigator.onLine,
      fullscreen: fullscreenAdapter.isActive(),
      screenCapture: captureSnapshotRef.current.screenCapture,
      webcamCapture: captureSnapshotRef.current.webcamCapture,
      activeSourceDescriptors: [],
    }),
    evidenceSources: {
      screen_share: capture.stream,
      webcam: webcamCapture.stream,
    },
    onEvidenceControllerChange: setEvidenceCoordinator,
  };
  useIntegrityCaptureRegistration(runtimeOptions);
  const legacyIntegrity = useIntegrityRuntime({ ...runtimeOptions,
    enabled: integrityRuntimeEnabled && !uploadOwner?.resident && (!uploadOwner || uploadOwner.capabilityKnown),
  });
  const integrity = uploadOwner?.resident ? uploadOwner.emitter : legacyIntegrity;
  const examCaptureContextValue = useMemo(
    () => ({
      ...capture,
      flushPendingUploads: async () => {
        if (uploadOwner?.resident) { await uploadOwner.flush(); return; }
        await evidenceCoordinatorRef.current?.flushPendingUploads();
      },
    }),
    [capture, uploadOwner],
  );
  // --- Domain monitoring hooks ---
  const screenShare = useScreenShareMonitoring({
    enabled: screenStreamMonitorEnabled,
    examSubmitted: examStatus === "submitted",
    monitoringDisabled: !effectiveMonitoringEnabled,
    moduleRole: screenModuleRole,
    emitter: integrity,
  });

  const webcam = useWebcamMonitoring({
    enabled: webcamStreamMonitorEnabled,
    examSubmitted: examStatus === "submitted",
    moduleRole: webcamModuleRole,
    streamActive: webcamCapture.streamActive,
    emitter: integrity,
  });

  const viewport = useViewportMonitoring({
    enabled: viewportMonitorEnabled,
    examSubmitted: examStatus === "submitted",
    isTablet: capability.isTablet,
    primarySourceModule,
    emitter: integrity,
  });

  const fullscreen = useFullscreenMonitoring({
    enabled:
      effectiveMonitoringEnabled &&
      effectiveRequiresFullscreen &&
      monitoringPlan.detectors.fullscreen,
    examSubmitted: examStatus === "submitted",
    emitter: integrity,
  });

  const mouseLeave = useMouseLeaveMonitoring({
    enabled: effectiveMonitoringEnabled && monitoringPlan.detectors.mouseLeave,
    isTablet: capability.isTablet,
    supportsFinePointer: capability.supportsFinePointer,
    examSubmitted: examStatus === "submitted",
    emitter: integrity,
  });

  const multiDisplay = useMultiDisplayMonitoring({
    enabled:
      effectiveMonitoringEnabled && monitoringPlan.detectors.multiDisplay,
    examSubmitted: examStatus === "submitted",
    emitter: integrity,
  });

  const runtimeReauthActive = screenShare.reauth.active;

  const handleBlockedAction = useCallback(
    (message: string) => {
      const now = Date.now();
      if (now - lastBlockedActionToastAt.current < 1000) {
        return;
      }
      lastBlockedActionToastAt.current = now;
      showToast({
        kind: "warning",
        title: message,
        timeout: 2000,
      });
    },
    [showToast],
  );

  const isAllowedExamRoute = useCallback(
    (pathname: string) => {
      const normalizedPath = pathname.replace(/\/+$/, "");
      const standaloneContestPath = `/contest/${contestId}`;
      if (
        normalizedPath === standaloneContestPath ||
        normalizedPath.startsWith(`${standaloneContestPath}/`)
      ) {
        return true;
      }

      if (classroomId) {
        const classroomContestPath = getClassroomContestDashboardPath(
          classroomId,
          contestId,
        );
        return (
          normalizedPath === classroomContestPath ||
          normalizedPath.startsWith(`${classroomContestPath}/`)
        );
      }

      return false;
    },
    [classroomId, contestId],
  );

  const recordForbiddenRouteAttempt = useCallback(
    (targetPath: string) => {
      void integrity.emit({
        eventType: "forbidden_action",
        clientOccurredAtMs: Date.now(),
        payload: {
          action: "exam_route_changed",
          target_path: targetPath,
          source: "exam_mode:route_guard",
        },
      });
    },
    [integrity],
  );

  const getExamFallbackPath = useCallback(() => {
    return (
      lastAllowedExamPathRef.current ||
      (classroomId
        ? `${getClassroomContestDashboardPath(classroomId, contestId)}/solve`
        : `/contest/${contestId}`)
    );
  }, [classroomId, contestId]);

  useEffect(() => {
    if (
      !effectiveMonitoringEnabled ||
      examStatus !== "in_progress" ||
      !precheckPassed
    ) {
      lastAllowedExamPathRef.current = null;
      return;
    }

    const currentPath = `${location.pathname}${location.search}${location.hash}`;
    if (isAllowedExamRoute(location.pathname)) {
      lastAllowedExamPathRef.current = currentPath;
      return;
    }

    recordForbiddenRouteAttempt(currentPath);

    const fallbackPath = getExamFallbackPath();
    if (fallbackPath && currentPath !== fallbackPath) {
      navigate(fallbackPath, { replace: true });
    }
  }, [
    effectiveMonitoringEnabled,
    examStatus,
    getExamFallbackPath,
    isAllowedExamRoute,
    location.hash,
    location.pathname,
    location.search,
    navigate,
    precheckPassed,
    recordForbiddenRouteAttempt,
  ]);

  useEffect(() => {
    if (
      !effectiveMonitoringEnabled ||
      examStatus !== "in_progress" ||
      !precheckPassed
    ) {
      return;
    }

    const handleDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      const targetPath = `${url.pathname}${url.search}${url.hash}`;
      if (url.origin === window.location.origin && isAllowedExamRoute(url.pathname)) {
        return;
      }

      event.preventDefault();
      recordForbiddenRouteAttempt(targetPath);
      const fallbackPath = getExamFallbackPath();
      if (fallbackPath) {
        navigate(fallbackPath, { replace: true });
      }
    };

    document.addEventListener("click", handleDocumentClick, true);
    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [
    effectiveMonitoringEnabled,
    examStatus,
    getExamFallbackPath,
    isAllowedExamRoute,
    navigate,
    precheckPassed,
    recordForbiddenRouteAttempt,
  ]);

  const [isRequestingScreenShare, setIsRequestingScreenShare] = useState(false);
  const [isRequestingWebcam, setIsRequestingWebcam] = useState(false);

  const handleScreenShareReacquire = useCallback(async () => {
    setIsRequestingScreenShare(true);
    try {
      const stream = await streamAdapter.acquireMonitorStream();
      if (stream) {
        setRuntimeScreenShareHandoff(stream);
        if (!await capture.resumeFromRuntimeHandoff()) return;
        screenShare.onStreamRestored();
        if (
          effectiveRequiresFullscreen &&
          !fullscreenAdapter.isActive()
        ) {
          void fullscreenAdapter.request();
        }
      }
    } finally {
      setIsRequestingScreenShare(false);
    }
  }, [capture, effectiveRequiresFullscreen, screenShare]);

  const handleWebcamReacquire = useCallback(async () => {
    if (!supportsUserMediaApi()) return;
    setIsRequestingWebcam(true);
    try {
      const stream = await requestUserMediaVideo();
      if (!isStreamHealthy(stream)) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      setRuntimeWebcamHandoff(stream);
      webcam.onStreamRestored("user_reauthorized");
    } catch {
      // The recovery modal stays open until a healthy stream is restored.
    } finally {
      setIsRequestingWebcam(false);
    }
  }, [webcam]);

  useExamMonitoring({
    enabled: effectiveMonitoringEnabled,
    onBlockedAction: handleBlockedAction,
    emitter: integrity,
  });

  useEffect(() => {
    if (!hasEnded) return;
    forceStopCapture("contest_ended");
    forceStopWebcamCapture();
  }, [forceStopCapture, forceStopWebcamCapture, hasEnded]);

  useEffect(() => {
    if (contestId) {
      syncAnticheatPhaseWithExamStatus(contestId, examStatus);
    }
  }, [contestId, examStatus]);

  useEffect(() => {
    return () => {
      resetAnticheatOrchestrator(contestId);
    };
  }, [contestId]);

  useEffect(() => {
    if (runtimeReauthActive) return;
    if (examStatus === "submitted") {
      const stopResult = stopCaptureForContest(contestId, "submitted");
      if (!stopResult) {
        forceStopCapture("submitted");
      }
      forceStopWebcamCapture();
      if (fullscreenAdapter.isActive()) {
        void fullscreenAdapter.exit();
      }
    }

    if (
      cheatDetectionEnabled &&
      examStatus === "locked" &&
      effectiveRequiresFullscreen &&
      isAnsweringPath() &&
      !fullscreenAdapter.isActive()
    ) {
      if (lockedFullscreenTimerRef.current) {
        clearTimeout(lockedFullscreenTimerRef.current);
      }
      lockedFullscreenTimerRef.current = setTimeout(() => {
        lockedFullscreenTimerRef.current = null;
        if (!fullscreenAdapter.isActive()) {
          void fullscreenAdapter.request();
        }
      }, 100);
    }
  }, [
    examStatus,
    cheatDetectionEnabled,
    contestId,
    effectiveRequiresFullscreen,
    forceStopCapture,
    forceStopWebcamCapture,
    isAnsweringPath,
    runtimeReauthActive,
  ]);

  useEffect(() => {
    return () => {
      if (lockedFullscreenTimerRef.current) {
        clearTimeout(lockedFullscreenTimerRef.current);
        lockedFullscreenTimerRef.current = null;
      }
    };
  }, []);

  const handleRecoverFullscreen = useCallback(async () => {
    if (effectiveRequiresFullscreen) {
      await fullscreenAdapter.request();
    }
  }, [effectiveRequiresFullscreen]);

  const shouldShowPolicyUnavailableScreen =
    policyUnavailable && isAnsweringPath();
  const shouldShowLockScreen =
    (examState.isLocked ||
      shouldShowPolicyUnavailableScreen ||
      pwaGuardFailed) &&
    isAnsweringPath();
  const missingMonitoringSource = monitoringPlan.missingEnabledSources[0];
  const policyUnavailableText = policyConfigMissing
    ? t(
        "exam.anticheatConfigMissing",
        "防作弊策略尚未載入，請回到儀表板重新整理後再作答。",
      )
    : missingMonitoringSource === "screen_share"
      ? t(
          "exam.screenShareUnsupported",
          "此瀏覽器不支援螢幕分享，請回到儀表板重新進行環境檢查，或改用支援螢幕分享的瀏覽器。",
        )
      : missingMonitoringSource === "webcam"
        ? t(
            "exam.webcamUnsupported",
            "此裝置無法使用 Webcam，請回到儀表板重新進行環境檢查，或改用可開啟 Webcam 的裝置。",
          )
        : t(
            "exam.monitoringDeviceUnsupported",
            "目前裝置不符合此考試的監考設定，請回到儀表板重新進行環境檢查。",
          );
  const lockReasonText = shouldShowPolicyUnavailableScreen
    ? policyUnavailableText
    : pwaGuardFailed
      ? t(
          "exam.pwaRequiredOnTablet",
          "iPad 監考必須以主畫面啟動的 PWA 模式作答，請返回儀表板重新開啟。",
        )
      : examState.lockReason;
  const monitoringReminder = useMemo<ExamMonitoringReminder | null>(() => {
    if (shouldShowPolicyUnavailableScreen) {
      return {
        source: "policy_unavailable",
        tone: "critical",
      };
    }

    if (pwaGuardFailed && isAnsweringPath()) {
      return {
        source: "pwa_required",
        tone: "critical",
      };
    }

    const activeSensorSource = screenShare.reauth.inProgress
      ? "screen_share"
      : webcam.interrupted
        ? "webcam"
        : viewport.interrupted
          ? (capability.isTablet ? "split_view" : "viewport")
          : fullscreen.interrupted
            ? "fullscreen"
            : mouseLeave.interrupted
              ? "mouse_leave"
              : multiDisplay.interrupted
                ? "multiple_displays"
                : null;
    if (!activeSensorSource) {
      return null;
    }
    return {
      source: activeSensorSource,
      tone: activeSensorSource === "screen_share" || activeSensorSource === "webcam"
        ? "critical"
        : "warning",
    };
  }, [
    capability.isTablet,
    isAnsweringPath,
    fullscreen.interrupted,
    mouseLeave.interrupted,
    multiDisplay.interrupted,
    pwaGuardFailed,
    screenShare.reauth.inProgress,
    shouldShowPolicyUnavailableScreen,
    viewport.interrupted,
    webcam.interrupted,
  ]);

  const handleBackToContest = async () => {
    await refreshAnticheatConfig();
    if (!classroomId) return;
    navigate(getClassroomContestDashboardPath(classroomId, contestId));
    if (onRefresh) onRefresh();
  };

  return (
    <IntegrityRuntimeProvider value={integrity}>
      <ExamMonitoringStatusProvider value={monitoringReminder}>
          <ExamCaptureProvider value={examCaptureContextValue}>
        <div
          ref={containerRef}
          style={{ position: "relative", width: "100%", height: "100%", flex: 1 }}
        >
          {children}
          <ExamOverlays
            showLockScreen={shouldShowLockScreen}
            lockReason={lockReasonText}
            onBackToContest={handleBackToContest}
          />
          <ExamModals
            recoverySource={fullscreen.interrupted ? "fullscreen" : mouseLeave.interrupted ? "mouse_leave" : multiDisplay.interrupted ? "multiple_displays" : null}
            onRecoverFullscreen={handleRecoverFullscreen}
            showUnlockNotification={showUnlockNotification}
            onUnlockContinue={handleUnlockContinue}
            showScreenShareRecovery={screenShare.reauth.inProgress}
            isRequestingScreenShare={isRequestingScreenShare}
            onScreenShareReacquire={handleScreenShareReacquire}
            showWebcamRecovery={webcam.interrupted}
            isRequestingWebcam={isRequestingWebcam}
            onWebcamReacquire={handleWebcamReacquire}
            showViewportRecovery={viewport.interrupted}
            isTablet={capability.isTablet}
          />
        </div>
          </ExamCaptureProvider>
      </ExamMonitoringStatusProvider>
    </IntegrityRuntimeProvider>
  );
};

export default ExamModeWrapper;
