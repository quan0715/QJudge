import { describe, expect, it } from "vitest";
import type { CopilotTranslationKey } from "@/core/copilot";
import { DefaultCopilotTranslations } from "./defaultCopilotTranslations";

const KEYS: CopilotTranslationKey[] = [
  "composer.placeholder",
  "composer.send",
  "run.stop",
  "run.retry",
  "session.new",
  "session.empty",
  "approval.approve",
  "approval.reject",
  "error.transport-error",
  "error.validation-error",
  "error.stream-disconnected",
  "error.stream-sequence-error",
  "error.unsupported-capability",
  "error.run-failed",
  "error.run-timeout",
  "error.unknown",
];

describe("DefaultCopilotTranslations", () => {
  it("provides non-empty English text for every public key", () => {
    const translations = new DefaultCopilotTranslations();
    for (const key of KEYS) expect(translations.t(key)).not.toBe("");
  });
});
