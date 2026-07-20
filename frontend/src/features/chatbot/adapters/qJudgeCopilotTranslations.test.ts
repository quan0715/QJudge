import { describe, expect, it, vi } from "vitest";
import { QJudgeCopilotTranslations } from "./qJudgeCopilotTranslations";

describe("QJudgeCopilotTranslations", () => {
  it("maps public keys through the chatbot i18n namespace", () => {
    const translate = vi.fn((key: string) => `translated:${key}`);
    const translations = new QJudgeCopilotTranslations(translate);

    expect(translations.t("composer.send")).toBe(
      "translated:chatbot:ui.send",
    );
    expect(translations.t("error.run-failed")).toBe(
      "translated:chatbot:errors.sendMessageFailed",
    );
    expect(translations.t("error.not-found")).toBe(
      "translated:chatbot:errors.sessionNotFound",
    );
    expect(translations.t("error.forbidden")).toBe(
      "translated:chatbot:errors.sessionForbidden",
    );
    expect(translate).toHaveBeenCalledWith(
      "chatbot:ui.send",
      expect.objectContaining({ defaultValue: "Send" }),
    );
  });
});
