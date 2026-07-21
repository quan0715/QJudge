import {
  CopilotFullPageShell,
  CopilotPanel,
  CopilotProvider,
  useCopilot,
  useCopilotModels,
  type CopilotActiveSessionState,
  type CopilotApprovalCardProps,
  type CopilotComposerProps,
  type CopilotEmptyStateProps,
  type CopilotErrorStateProps,
  type CopilotHeaderProps,
  type CopilotHistorySlotProps,
  type CopilotInitialSessionStrategy,
  type CopilotMessageListSlotProps,
  type CopilotMessageViewProps,
  type CopilotModel,
  type CopilotModelCatalog,
  type CopilotModelStatus,
  type CopilotQuestionCardProps,
  type CopilotRunState,
  type CopilotRemoveSessionResult,
  type CopilotRenameSessionResult,
  type CopilotSendResult,
  type CopilotSessionLocation,
  type CopilotStorage,
  type CopilotSuggestion,
  type CopilotSuggestionsProps,
  type CopilotTransport,
  type CopilotTransportCapabilities,
  type CopilotTranslations,
  type CopilotUISlots,
  type CopilotWorkspaceShellProps,
  type UseCopilotModelsResult,
  type UseCopilotSessionsResult,
} from "@copilot";
import {
  MemoryCopilotModelCatalog,
  MemoryCopilotSessionLocation,
  MemoryCopilotStorage,
  MemoryCopilotTransport,
  runCopilotTransportContract,
} from "@copilot/testing";

const transport: CopilotTransport = new MemoryCopilotTransport();
const model: CopilotModel = { id: "example", displayName: "Example" };
const modelStatus: CopilotModelStatus = "ready";
const modelCatalog: CopilotModelCatalog = new MemoryCopilotModelCatalog([model]);
const sessionLocation: CopilotSessionLocation = new MemoryCopilotSessionLocation();
const storage: CopilotStorage = new MemoryCopilotStorage();
const initialSession: CopilotInitialSessionStrategy = "first-or-create";
const active: CopilotActiveSessionState = {
  status: "empty",
  id: null,
  data: null,
  error: null,
};
const run: CopilotRunState = { status: "ready", run: null };
const result: CopilotSendResult = { accepted: false, sessionId: "" };
const workspace: CopilotWorkspaceShellProps = {
  children: null,
  side: "right",
};
void [
  CopilotProvider,
  CopilotFullPageShell,
  CopilotPanel,
  useCopilot,
  runCopilotTransportContract,
  transport,
  model,
  modelStatus,
  modelCatalog,
  sessionLocation,
  storage,
  initialSession,
  active,
  run,
  result,
  workspace,
];
declare const capabilities: CopilotTransportCapabilities;
declare const translations: CopilotTranslations;
declare const slots: CopilotUISlots;
declare const approvalSlot: CopilotApprovalCardProps;
declare const composerSlot: CopilotComposerProps;
declare const emptyStateSlot: CopilotEmptyStateProps;
declare const errorStateSlot: CopilotErrorStateProps;
declare const headerSlot: CopilotHeaderProps;
declare const historySlot: CopilotHistorySlotProps;
declare const messageListSlot: CopilotMessageListSlotProps;
declare const messageSlot: CopilotMessageViewProps;
declare const questionSlot: CopilotQuestionCardProps;
declare const suggestion: CopilotSuggestion;
declare const suggestionsSlot: CopilotSuggestionsProps;
void [
  capabilities,
  translations,
  slots,
  approvalSlot,
  composerSlot,
  emptyStateSlot,
  errorStateSlot,
  headerSlot,
  historySlot,
  messageListSlot,
  messageSlot,
  questionSlot,
  suggestion,
  suggestionsSlot,
];
declare const modelRuntime: UseCopilotModelsResult;
modelRuntime.select(null);
declare const sessionRuntime: UseCopilotSessionsResult;
const renameResult: Promise<CopilotRenameSessionResult> = sessionRuntime.rename(
  "session-1",
  "Renamed",
);
const removeResult: Promise<CopilotRemoveSessionResult> = sessionRuntime.remove(
  "session-1",
);
void [renameResult, removeResult];
void useCopilotModels;
