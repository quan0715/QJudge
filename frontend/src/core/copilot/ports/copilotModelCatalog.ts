import type {
  CopilotModel,
  CopilotRequestOptions,
} from "../copilot.types";

export interface CopilotModelCatalog {
  list(options?: CopilotRequestOptions): Promise<readonly CopilotModel[]>;
}
