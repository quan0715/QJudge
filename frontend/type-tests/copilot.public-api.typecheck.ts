import {
  CopilotFullPageShell,
  CopilotProvider,
  useCopilot,
  useCopilotModels,
  type CopilotActiveSessionState,
  type CopilotRunState,
  type CopilotSendResult,
  type CopilotTransport,
  type CopilotWorkspaceShellProps,
  type UseCopilotModelsResult,
} from "@copilot";
import {
  MemoryCopilotTransport,
  runCopilotTransportContract,
} from "@copilot/testing";

const transport: CopilotTransport = new MemoryCopilotTransport();
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
  useCopilot,
  runCopilotTransportContract,
  transport,
  active,
  run,
  result,
  workspace,
];
declare const modelRuntime: UseCopilotModelsResult;
modelRuntime.select(null);
void useCopilotModels;
