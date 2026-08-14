import { describe, expect, it, vi } from "vitest";
import type { ChatbotRepository } from "@/core/ports/chatbot.repository";
import { QJudgeCopilotModelCatalog } from "./qJudgeCopilotModelCatalog";

describe("QJudgeCopilotModelCatalog", () => {
  it("maps repository models to product-neutral models", async () => {
    const repository = {
      getModels: vi.fn().mockResolvedValue([
        {
          model_id: "model-a",
          display_name: "Model A",
          description: "Fast",
          is_default: true,
        },
      ]),
    } as Pick<ChatbotRepository, "getModels">;
    const catalog = new QJudgeCopilotModelCatalog(repository);

    await expect(catalog.list()).resolves.toEqual([
      {
        id: "model-a",
        displayName: "Model A",
        description: "Fast",
        isDefault: true,
      },
    ]);
  });
});
