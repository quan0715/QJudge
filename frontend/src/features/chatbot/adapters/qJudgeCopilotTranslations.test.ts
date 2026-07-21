import { describe, expect, it, vi } from "vitest";

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
});
