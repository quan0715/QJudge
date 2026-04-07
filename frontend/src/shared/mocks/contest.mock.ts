import type { ContestDetail } from "@/core/entities/contest.entity";

export const createMockContest = (
  overrides?: Partial<ContestDetail>,
): ContestDetail => ({
  id: "contest-001",
  name: "E2E Test Contest",
  description: "A test contest for storybook",
  startTime: "2026-04-10T09:00:00.000Z",
  endTime: "2026-04-10T12:00:00.000Z",
  status: "published",
  visibility: "public",
  requiresPassword: false,
  password: "",
  deliveryMode: "exam",
  organizer: "teacher",
  hasJoined: false,
  isRegistered: false,
  currentUserRole: "teacher",
  participantCount: 30,
  contestType: "paper_exam",
  countsTowardGrade: false,
  cheatDetectionEnabled: true,
  anticheatDevicePolicy: {
    desktop: {
      enabled: true,
      sources: {
        screenShare: { enabled: true, captureIntervalSeconds: 5 },
        webcam: { enabled: false, captureIntervalSeconds: 10 },
      },
      detectors: {
        pwaMode: false,
        fullscreen: true,
        focus: true,
        tabVisibility: true,
        multiDisplay: true,
        mouseLeave: true,
        viewportIntegrity: false,
      },
    },
    tablet: {
      enabled: true,
      sources: {
        screenShare: { enabled: false, captureIntervalSeconds: 5 },
        webcam: { enabled: true, captureIntervalSeconds: 10 },
      },
      detectors: {
        pwaMode: true,
        fullscreen: false,
        focus: true,
        tabVisibility: true,
        multiDisplay: false,
        mouseLeave: true,
        viewportIntegrity: true,
      },
    },
  },
  warningTimeoutSeconds: 20,
  screenShareRecoveryGraceMs: 30000,
  scoreboardVisibleDuringContest: false,
  anonymousModeEnabled: false,
  allowMultipleJoins: false,
  maxCheatWarnings: 3,
  allowAutoUnlock: true,
  autoUnlockMinutes: 5,
  resultsPublished: false,
  examQuestionsCount: 10,
  isExamMonitored: true,
  requiresFullscreen: true,
  canSubmitExam: true,
  rules: "1. No cheating\n2. Time limit: 3 hours",
  permissions: {
    canSwitchView: true,
    canEditContest: true,
    canDeleteContest: true,
    canToggleStatus: true,
    canPublishProblems: true,
    canViewAllSubmissions: true,
    canViewFullScoreboard: true,
    canManageClarifications: true,
  },
  problems: [],
  ...overrides,
});

/** Stub translation function for stories — returns the last segment of the key as readable text. */
export const stubT = (key: string, fallback?: string | Record<string, unknown>): string => {
  if (typeof fallback === "string") return fallback;
  const parts = key.split(".");
  return parts[parts.length - 1] ?? key;
};
