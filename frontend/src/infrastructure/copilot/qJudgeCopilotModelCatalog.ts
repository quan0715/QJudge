import type { ChatbotRepository } from "@/core/ports/chatbot.repository";
import type { CopilotModel, CopilotModelCatalog } from "@copilot";

export class QJudgeCopilotModelCatalog implements CopilotModelCatalog {
  private readonly repository: Pick<ChatbotRepository, "getModels">;

  constructor(repository: Pick<ChatbotRepository, "getModels">) {
    this.repository = repository;
  }

  async list(): Promise<readonly CopilotModel[]> {
    const models = await this.repository.getModels();
    return models.map((model) => ({
      id: model.model_id,
      displayName: model.display_name,
      description: model.description,
      isDefault: model.is_default,
    }));
  }
}
