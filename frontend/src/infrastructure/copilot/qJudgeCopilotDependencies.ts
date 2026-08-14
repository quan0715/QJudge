import chatbotRepository from "@/infrastructure/api/repositories/chatbot.repository";
import { uploadUserArtifact } from "@/infrastructure/api/repositories/artifact.repository";
import { BrowserCopilotStorage } from "./browserCopilotStorage";
import { createQJudgeCopilotTransport } from "./qJudgeCopilotTransport";
import { QJudgeCopilotModelCatalog } from "./qJudgeCopilotModelCatalog";

export const qJudgeCopilotTransport = createQJudgeCopilotTransport(
  chatbotRepository,
  uploadUserArtifact,
);
export const qJudgeCopilotModelCatalog = new QJudgeCopilotModelCatalog(
  chatbotRepository,
);
export const qJudgeCopilotStorage = new BrowserCopilotStorage();
