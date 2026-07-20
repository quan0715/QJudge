import type { ChatbotRepository } from "@/core/ports/chatbot.repository";
import type { CopilotModel, CopilotModelCatalog } from "@copilot";

export const QJUDGE_FALLBACK_MODELS: readonly CopilotModel[] = [
  {
    id: "openai-nano",
    displayName: "gpt-5-nano",
    description: "快速且成本低，適合日常教學互動",
    isDefault: true,
  },
  {
    id: "openai-mini",
    displayName: "gpt-5.4-mini (low)",
    description: "OpenAI 推理模型，低思考強度，平衡速度與品質",
    isDefault: false,
  },
  {
    id: "openai-mini-medium",
    displayName: "gpt-5.4-mini (medium)",
    description: "OpenAI 推理模型，中等思考強度，適合複雜批改與推理",
    isDefault: false,
  },
  {
    id: "deepseek-v4",
    displayName: "deepseek-v4",
    description: "1M context、快速、低成本，適合日常對話與 summarization（非推理模式）",
    isDefault: false,
  },
  {
    id: "deepseek-v4-thinking",
    displayName: "deepseek-v4 (thinking)",
    description: "1M context、推理模式（reasoning_effort=low），適合複雜批改與測資生成",
    isDefault: false,
  },
];

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
