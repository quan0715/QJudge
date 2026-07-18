import type { CopilotErrorCode } from "../copilot.types";

export interface CopilotTranslations {
  t(key: CopilotTranslationKey, values?: Record<string, unknown>): string;
}

export type CopilotTranslationKey =
  | "composer.placeholder"
  | "composer.send"
  | "run.stop"
  | "run.retry"
  | "session.new"
  | "session.empty"
  | "approval.approve"
  | "approval.reject"
  | `error.${CopilotErrorCode}`;
