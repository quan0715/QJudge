import type {
  ApprovalRequest,
  ChatRun,
  NextTurnOption,
  QuestionRequest,
} from "@/core/types/chatbot.types";
import type {
  CopilotApprovalRequest,
  CopilotQuestionRequest,
  CopilotRunState,
  CopilotSuggestion,
} from "@copilot";
import {
  mapChatApprovalToCopilot,
  mapChatRunToCopilot,
} from "@/infrastructure/copilot/chatbotCopilotMapper";

interface LegacyChatContainerStateInput {
  currentSessionId: string | null;
  activeRuns: readonly ChatRun[];
  pendingApproval: ApprovalRequest | null;
  pendingQuestion: QuestionRequest | null;
  nextTurnOptions: readonly NextTurnOption[] | null;
  isSessionLoading: boolean;
  isStreaming: boolean;
}

interface LegacyChatContainerState {
  run: CopilotRunState;
  approval: CopilotApprovalRequest | null;
  question: CopilotQuestionRequest | null;
  suggestions: readonly CopilotSuggestion[];
}

const ACTIVE_STATUS_PRIORITY = [
  "awaiting_user_answer",
  "awaiting_approval",
  "running",
  "queued",
] as const;

function selectCurrentRun(
  runs: readonly ChatRun[],
  sessionId: string | null,
): ChatRun | null {
  if (!sessionId) return null;
  for (const status of ACTIVE_STATUS_PRIORITY) {
    const match = runs.find(
      (run) => run.sessionId === sessionId && run.status === status,
    );
    if (match) return match;
  }
  return null;
}

function mapQuestion(
  request: QuestionRequest | null,
): CopilotQuestionRequest | null {
  if (!request) return null;
  return {
    question: request.question,
    input: request.inputType === "choice" ? "choice" : "text",
    options: request.options,
  };
}

function createRunState(
  activeRun: ChatRun | null,
  approval: CopilotApprovalRequest | null,
  question: CopilotQuestionRequest | null,
): CopilotRunState {
  if (!activeRun) return { status: "ready", run: null };

  const run = mapChatRunToCopilot(activeRun);
  if (run.status === "queued") return { status: "submitted", run };
  if (run.status === "running") return { status: "streaming", run };
  if (run.status === "awaiting-approval") {
    const request = run.approvalRequest ?? approval;
    return request
      ? { status: "awaiting-approval", run, request }
      : { status: "streaming", run };
  }
  if (run.status === "awaiting-answer") {
    const request = run.questionRequest ?? question;
    return request
      ? { status: "awaiting-answer", run, request }
      : { status: "streaming", run };
  }
  return { status: "ready", run: null };
}

export function createLegacyChatContainerState({
  currentSessionId,
  activeRuns,
  pendingApproval,
  pendingQuestion,
  nextTurnOptions,
  isSessionLoading,
  isStreaming,
}: LegacyChatContainerStateInput): LegacyChatContainerState {
  const mappedApproval = pendingApproval
    ? mapChatApprovalToCopilot(pendingApproval)
    : null;
  const mappedQuestion = mapQuestion(pendingQuestion);
  const run = createRunState(
    selectCurrentRun(activeRuns, currentSessionId),
    mappedApproval,
    mappedQuestion,
  );

  if (isSessionLoading) {
    return { run, approval: null, question: null, suggestions: [] };
  }

  return {
    run,
    approval: mappedApproval,
    question: mappedQuestion,
    suggestions:
      !isStreaming && !mappedApproval && !mappedQuestion
        ? (nextTurnOptions ?? [])
        : [],
  };
}
