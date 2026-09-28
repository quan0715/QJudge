import { describe, expect, it } from "vitest";

import type { CopilotError } from "@copilot";

import { aiErrorCode, modelAvailabilityNotice } from "./modelAvailabilityNotice";

function upstream(code: string, operation: CopilotError["operation"]): CopilotError {
  const original = Object.assign(new Error("upstream"), {
    envelope: { success: false, error: { code } },
  });
  return { code: "transport-error", operation, recoverable: true, cause: original };
}

const model = { id: "gemma4-31b", displayName: "Gemma4-31B" };

describe("aiErrorCode", () => {
  it("reads the envelope code through wrapped causes", () => {
    expect(aiErrorCode(upstream("MODEL_CONFIG_INVALID", "load-models"))).toBe("MODEL_CONFIG_INVALID");
    expect(aiErrorCode(new Error("plain"))).toBeUndefined();
    expect(aiErrorCode(null)).toBeUndefined();
  });
});

describe("modelAvailabilityNotice", () => {
  it("blocks with a config message when the catalog reports invalid config", () => {
    expect(
      modelAvailabilityNotice({
        status: "error",
        models: [],
        error: upstream("MODEL_CONFIG_INVALID", "load-models"),
      }),
    ).toEqual({ kind: "config-invalid", blocking: true });
  });

  it("blocks with the service message for other load failures", () => {
    expect(
      modelAvailabilityNotice({
        status: "error",
        models: [],
        error: upstream("AI_SERVICE_UNAVAILABLE", "load-models"),
      }),
    ).toEqual({ kind: "service-unavailable", blocking: true });
  });

  it("blocks when the site has no models", () => {
    expect(modelAvailabilityNotice({ status: "ready", models: [], error: null })).toEqual({
      kind: "no-models",
      blocking: true,
    });
  });

  it("asks for another model when a send hits an unavailable model", () => {
    expect(
      modelAvailabilityNotice({
        status: "ready",
        models: [model],
        error: null,
        runError: upstream("MODEL_NOT_AVAILABLE", "start-run"),
      }),
    ).toEqual({ kind: "model-not-available", blocking: false });
  });

  it("stays quiet while loading or when models are ready", () => {
    expect(modelAvailabilityNotice({ status: "loading", models: [], error: null })).toBeNull();
    expect(modelAvailabilityNotice({ status: "ready", models: [model], error: null })).toBeNull();
    expect(
      modelAvailabilityNotice({
        status: "ready",
        models: [model],
        error: null,
        runError: upstream("RUN_STATE_CONFLICT", "start-run"),
      }),
    ).toBeNull();
  });
});
