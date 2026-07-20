import { describe, expect, it, vi } from "vitest";
import en from "@/i18n/locales/en/chatbot.json";
import ja from "@/i18n/locales/ja/chatbot.json";
import ko from "@/i18n/locales/ko/chatbot.json";
import zhTW from "@/i18n/locales/zh-TW/chatbot.json";
import { QJudgeCopilotTranslations } from "./qJudgeCopilotTranslations";

const supportedResources = { en, ja, ko, "zh-TW": zhTW };

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

  it.each(Object.entries(supportedResources))(
    "%s provides localized session access errors",
    (_locale, resource) => {
      expect(resource.errors.sessionNotFound).toBeTypeOf("string");
      expect(resource.errors.sessionNotFound.trim()).not.toBe("");
      expect(resource.errors.sessionForbidden).toBeTypeOf("string");
      expect(resource.errors.sessionForbidden.trim()).not.toBe("");
    },
  );
});
