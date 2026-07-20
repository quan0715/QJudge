import { useCopilotModelContext } from "../react/copilotContexts";

export type UseCopilotModelsResult = ReturnType<
  typeof useCopilotModelContext
>;

export function useCopilotModels(): UseCopilotModelsResult {
  return useCopilotModelContext();
}
