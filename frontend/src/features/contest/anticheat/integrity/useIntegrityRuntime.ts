import type {
  ContestIntegrityRun,
} from "@/core/entities/contest.entity";
import type {
  ExamIntegrityHealthSnapshot,
  ExamIntegrityStateSnapshot,
  IntegrityHealthUpdate,
} from "@/core/entities/examIntegrity.entity";
import type { EvidenceCoordinator } from "./evidenceCoordinator";

export interface UseIntegrityRuntimeOptions {
  enabled: boolean;
  contestId: string;
  integrityRun?: ContestIntegrityRun;
  snapshotProvider: () => Omit<ExamIntegrityStateSnapshot, "health">;
  evidenceSources?: Partial<Record<"screen_share" | "webcam", MediaStream | null>>;
  onEvidenceControllerChange?: (controller: EvidenceCoordinator | null) => void;
}

export const sourceTargets = (policy: Record<string, unknown> | undefined) => {
  const evidence = policy?.evidence as Record<string, unknown> | undefined;
  const source = (name: "screen" | "webcam", fallback: { width: number; height: number; fps: number; bitrate: number }) => {
    const value = evidence?.[name];
    if (!value || typeof value !== "object") return fallback;
    const configured = value as Record<string, unknown>;
    return {
      width: typeof configured.width === "number" ? configured.width : fallback.width,
      height: typeof configured.height === "number" ? configured.height : fallback.height,
      fps: typeof configured.fps === "number" ? configured.fps : fallback.fps,
      bitrate: typeof configured.bitrate === "number" ? configured.bitrate : fallback.bitrate,
    };
  };
  return {
    screen_share: source("screen", { width: 1280, height: 720, fps: 5, bitrate: 800_000 }),
    webcam: source("webcam", { width: 640, height: 480, fps: 10, bitrate: 350_000 }),
  };
};

export const evidenceBufferPolicy = (policy: Record<string, unknown> | undefined) => {
  const evidence = policy?.evidence as Record<string, unknown> | undefined;
  return {
    minimumLocalBufferMs: typeof evidence?.minimum_local_buffer_ms === "number"
      ? evidence.minimum_local_buffer_ms : 60_000,
    localCapMs: typeof evidence?.local_cap_ms === "number" ? evidence.local_cap_ms : 300_000,
    localCapBytesPerSource: typeof evidence?.local_cap_bytes_per_source === "number"
      ? evidence.local_cap_bytes_per_source : 100_000_000,
  };
};

// Screen share always records; the frozen policy only decides the webcam.
export const enabledEvidenceSources = (
  policy: Record<string, unknown> | undefined,
): Set<"screen_share" | "webcam"> =>
  new Set(policy?.webcam_required === true ? ["screen_share", "webcam"] : ["screen_share"]);

export const initialHealthSnapshot = (): ExamIntegrityHealthSnapshot => ({
  displayApi: { status: "initializing" },
  evidenceSources: {
    screen_share: { status: "disabled" },
    webcam: { status: "disabled" },
  },
  evidenceBuffer: {
    screen_share: { status: "disabled" },
    webcam: { status: "disabled" },
  },
});

export const applyIntegrityHealthUpdate = (
  current: ExamIntegrityHealthSnapshot,
  update: IntegrityHealthUpdate,
): ExamIntegrityHealthSnapshot => {
  const value = {
    status: update.status,
    ...(update.reason ? { reason: update.reason } : {}),
  };
  if (update.component === "display_api") {
    return { ...current, displayApi: value };
  }
  const key = update.component === "evidence_source"
    ? "evidenceSources"
    : "evidenceBuffer";
  return {
    ...current,
    [key]: { ...current[key], [update.source]: value },
  };
};

type IntegritySourceFile = { path: string; text: string };

const contestIntegrityRawSources = import.meta.glob<string>(
  [
    "../../components/ExamModeWrapper.tsx",
    "../../hooks/useExamMonitoring.ts",
    "../../hooks/useFullscreenMonitoring.ts",
    "../../hooks/useMouseLeaveMonitoring.ts",
    "../../hooks/useMultiDisplayMonitoring.ts",
    "../../hooks/useScreenShareMonitoring.ts",
    "../../hooks/useWebcamMonitoring.ts",
    "../../hooks/useExamState.ts",
    "../../hooks/useContestExamActions.ts",
    "../../hooks/useExamSessionFlow.ts",
    "../../screens/paperExam/PaperExamAnsweringScreen.tsx",
    "../../screens/paperExam/hooks/useAnticheatScreenCapture.ts",
    "../../screens/paperExam/hooks/useAnticheatWebcamCapture.ts",
    "../../detectors/clipboardDetector.ts",
    "../../detectors/keyboardShortcutDetector.ts",
    "../../detectors/popupGuardDetector.ts",
    "./integrityTransport.ts",
    "./residentIntegritySession.ts",
  ],
  { eager: true, query: "?raw", import: "default" },
);

export const contestIntegritySourceFiles = async (): Promise<IntegritySourceFile[]> =>
  Object.entries(contestIntegrityRawSources).map(([path, text]) => ({ path, text }));
