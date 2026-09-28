import type { CopilotError, CopilotModel, CopilotModelStatus } from "@copilot";

export type ModelAvailabilityNotice =
  | { kind: "config-invalid" | "no-models" | "service-unavailable"; blocking: true }
  | { kind: "model-not-available"; blocking: false };

export const MODEL_NOTICE_I18N_KEY: Record<ModelAvailabilityNotice["kind"], string> = {
  "config-invalid": "errors.aiModelConfigInvalid",
  "no-models": "errors.aiNoModelsConfigured",
  "service-unavailable": "errors.aiServiceUnavailable",
  "model-not-available": "errors.aiModelNotAvailable",
};

/** AI Service error code carried by a failed request, through wrapped causes. */
export function aiErrorCode(cause: unknown): string | undefined {
  let current: unknown = cause;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    const envelope = (current as { envelope?: unknown }).envelope;
    if (envelope && typeof envelope === "object") {
      const error = (envelope as { error?: unknown }).error;
      const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
      if (typeof code === "string") return code;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export function modelAvailabilityNotice(input: {
  status: CopilotModelStatus;
  models: readonly CopilotModel[];
  error: CopilotError | null;
  runError?: CopilotError | null;
}): ModelAvailabilityNotice | null {
  if (input.status === "error") {
    return aiErrorCode(input.error) === "MODEL_CONFIG_INVALID"
      ? { kind: "config-invalid", blocking: true }
      : { kind: "service-unavailable", blocking: true };
  }
  if (input.status === "ready" && input.models.length === 0) {
    return { kind: "no-models", blocking: true };
  }
  if (
    input.runError?.operation === "start-run" &&
    aiErrorCode(input.runError) === "MODEL_NOT_AVAILABLE"
  ) {
    return { kind: "model-not-available", blocking: false };
  }
  return null;
}
