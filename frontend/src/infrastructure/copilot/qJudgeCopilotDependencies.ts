import { chatbotRepository } from "@/infrastructure/api/repositories";
import { uploadUserArtifact } from "@/infrastructure/api/repositories/artifact.repository";
import { BrowserCopilotStorage } from "./browserCopilotStorage";
import { createQJudgeCopilotTransport } from "./qJudgeCopilotTransport";
import {
  QJudgeCopilotModelCatalog,
  QJUDGE_FALLBACK_MODELS,
} from "./qJudgeCopilotModelCatalog";

export const qJudgeCopilotTransport = createQJudgeCopilotTransport(
  chatbotRepository,
  uploadUserArtifact,
);
export const qJudgeCopilotModelCatalog = new QJudgeCopilotModelCatalog(
  chatbotRepository,
);
export const qJudgeCopilotStorage = new BrowserCopilotStorage();
export { QJUDGE_FALLBACK_MODELS };
