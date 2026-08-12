import { describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";

import { QJudgeCopilotTranslations } from "./qJudgeCopilotTranslations";

describe("QJudgeCopilotTranslations", () => {
  it("maps Copilot session labels to task terminology", () => {
    const translate = vi.fn((key: string) => key);
    const translations = new QJudgeCopilotTranslations(translate);

    translations.t("session.new");
    translations.t("session.empty");

    expect(translate).toHaveBeenNthCalledWith(
      1,
      "chatbot:ui.newTask",
      expect.objectContaining({ defaultValue: expect.any(String) }),
    );
    expect(translate).toHaveBeenNthCalledWith(
      2,
      "chatbot:ui.noTasks",
      expect.objectContaining({ defaultValue: expect.any(String) }),
    );
  });

  it("resolves error-state labels instead of rendering raw i18n keys", () => {
    const t = i18n.getFixedT("zh-TW", "chatbot");

    expect(t("ui.error")).toBe("錯誤");
    expect(t("ui.retry")).toBe("重試");
  });
});
