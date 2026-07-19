import {
  useLegacyChatbotRuntime,
  type UseChatbotOptions,
  type UseChatbotReturn,
} from "../adapters/useLegacyChatbotRuntime";

export { applyRunMessageUpdate } from "../lib/chatbotLegacyMerge";
export type { StreamedRunState } from "../lib/chatbotLegacyMerge";
export type { UseChatbotOptions, UseChatbotReturn };

/**
 * QJudge compatibility facade. New reusable consumers should use the granular
 * hooks exported by `@/shared/copilot`; this surface stays stable while legacy
 * product-specific cards and model selection are migrated behind adapters.
 */
export function useChatbot(options: UseChatbotOptions = {}): UseChatbotReturn {
  return useLegacyChatbotRuntime(options);
}
