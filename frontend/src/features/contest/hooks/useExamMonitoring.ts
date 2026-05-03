import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  ClipboardDetector,
  KeyboardShortcutDetector,
  PopupGuardDetector,
} from "@/features/contest/detectors";
import type { ViolationEvent, ExamDetector } from "@/features/contest/detectors";
import { isRuntimeScreenShareReauthActive } from "@/features/contest/anticheat/runtimeReauthState";
import {
  recordExamEventWithForcedCapture,
  type ForcedCaptureModule,
} from "@/features/contest/anticheat/forcedCapture";

interface UseExamMonitoringProps {
  contestId?: string;
  enabled: boolean;
  onViolation: (eventType: string, reason: string) => Promise<void> | void;
  onBlockedAction?: (message: string) => void;
  evidenceCaptureModules?: ForcedCaptureModule[];
}

export function useExamMonitoring({
  contestId,
  enabled,
  onViolation,
  onBlockedAction,
  evidenceCaptureModules,
}: UseExamMonitoringProps) {
  const { t } = useTranslation("contest");
  const onViolationRef = useRef(onViolation);
  const onBlockedActionRef = useRef(onBlockedAction);
  const evidenceCaptureModulesRef = useRef(evidenceCaptureModules);
  const tRef = useRef(t);

  useEffect(() => { onViolationRef.current = onViolation; }, [onViolation]);
  useEffect(() => { onBlockedActionRef.current = onBlockedAction; }, [onBlockedAction]);
  useEffect(() => { evidenceCaptureModulesRef.current = evidenceCaptureModules; }, [evidenceCaptureModules]);
  useEffect(() => { tRef.current = t; }, [t]);

  useEffect(() => {
    if (!enabled) return;

    const handleViolation = (event: ViolationEvent) => {
      if (isRuntimeScreenShareReauthActive(contestId)) {
        return;
      }
      if (event.eventType === "clipboard_action") {
        if (contestId) {
          void recordExamEventWithForcedCapture(contestId, "clipboard_action", {
            source: "clipboard_detector",
            forceCaptureReason: "clipboard_action:clipboard_detector",
            captureOptions: {
              eventType: "clipboard_action",
              modules: evidenceCaptureModulesRef.current,
            },
            metadata: event.metadata,
          });
        }
        return;
      }
      if (event.severity === "info") {
        onBlockedActionRef.current?.(event.message);
        return;
      }
      Promise.resolve(onViolationRef.current(event.eventType, event.message)).catch(() => undefined);
    };

    const activeDetectors: ExamDetector[] = [
      new ClipboardDetector(tRef.current),
      new KeyboardShortcutDetector(tRef.current),
      new PopupGuardDetector(tRef.current),
    ];

    activeDetectors.forEach((d) => d.start(handleViolation));

    return () => {
      activeDetectors.forEach((d) => d.stop());
    };
  }, [contestId, enabled]);
}
