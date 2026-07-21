// ===== Base Types =====
export type ChatRole = "user" | "assistant";


// ===== v2 SSE Event Types =====
export type StreamEventType =
  | "run_started"
  | "agent_message_delta"
  | "thinking_delta"
  | "summarization_started"
  | "summarization_ended"
  | "todo_update"
  | "verification_report"
  | "tool_call_started"
  | "tool_call_finished"
  | "usage_report"
  | "run_completed"
  | "run_failed"
  | "run_cancelled"
  | "awaiting_approval"
  | "awaiting_user_answer";

export interface BaseStreamEvent {
  type: StreamEventType;
  timestamp?: string;
  eventId?: string;
}

// ===== Information Structures =====
export interface ThinkingInfo {
  thinking: string;
  signature: string;
}

export interface ToolInfo {
  toolName: string;
  toolCallId?: string;
  inputData?: Record<string, unknown>;
  result?: string | Record<string, unknown>;
  isError?: boolean;
  durationMs?: number;
}

export type RunTodoStatus = "pending" | "in_progress" | "success" | "fail";

export interface RunTodoItem {
  id: string;
  label: string;
  status: RunTodoStatus;
}

export type RunTodoInputStatus =
  | RunTodoStatus
  | "completed"
  | "complete"
  | "done"
  | "running"
  | "in_progress"
  | "failed"
  | "error";

export interface RunTodoInputItem {
  id?: string;
  content?: string;
  label?: string;
  status?: RunTodoInputStatus | string;
}

export interface VerificationReport {
  iteration: number;
  passed: boolean;
  issues: string[];
  summary: string;
}

export interface ModelInfo {
  model_id: string;
  display_name: string;
  description: string;
  is_default: boolean;
}

// ===== Chat Message & Session =====
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: Date;
  thinkingInfo?: ThinkingInfo;
  toolExecutions?: ToolInfo[];
  verificationReports?: VerificationReport[];
  todoItems?: RunTodoItem[];
  isThinking?: boolean;
  toolName?: string;
  runId?: string;
  runStatus?: ChatRunStatus;
  runError?: string;
  lastEventSeq?: number;
  nextTurnOptions?: NextTurnOption[];
}

export type ChatRunStatus =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "awaiting_user_answer"
  | "completed"
  | "failed"
  | "cancelled";

export interface ChatRun {
  id: string;
  sessionId: string;
  status: ChatRunStatus;
  kind: "chat" | "resume";
  modelId: string;
  lastEventSeq: number;
  approvalPayload?: {
    action_requests?: ApprovalActionRequest[];
    review_configs?: Array<{ action_name: string; allowed_decisions: string[] }>;
  };
  questionPayload?: {
    question?: string;
    options?: string[];
    input_type?: string;
  };
  userMessageId?: number;
  assistantMessageId?: number;
  error?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  /** Arbitrary session context（task_manifest 等），目前由 AISessionListSerializer 攜帶。 */
  context?: Record<string, unknown>;
  metadata?: {
    backend_session_id?: string;
    deepagent_thread_id?: string;
    title_pending?: boolean;
    sync_timestamp?: number;
    active_run_id?: string;
    active_run_status?: ChatRunStatus;
  };
}

export interface StreamEvent extends BaseStreamEvent {
  content?: string;
  thinkingInfo?: ThinkingInfo;
  toolInfo?: ToolInfo;
  metadata?: Record<string, unknown>;
  todoItems?: RunTodoItem[];
  runId?: string;
  threadId?: string;
  verificationReport?: VerificationReport;
  toolName?: string;
}

// ===== Background Context =====
export interface UserContext {
  userId?: string;
  userRole?: "student" | "teacher" | "admin";
  preferences?: Record<string, unknown>;
}

export interface PageContext {
  pageType: string;
  pageUrl?: string;
  pageData?: Record<string, unknown>;
}

export interface ChatContext {
  user?: UserContext;
  page?: PageContext;
  custom?: Record<string, unknown>;
}

export interface BackgroundInformation {
  // Legacy-compatible fields (still used by some stories/UI scaffolds)
  context?: string;
  problemId?: string;
  problemTitle?: string;
  difficulty?: string;
  description?: string;

  user?: {
    username: string;
    role?: string;
  };
  problem?: {
    id: number | string;
    title: string;
    difficulty?: string;
  };
}

// ===== Problem Reference =====
export interface ProblemReference {
  id: number | string;
  title: string;
  difficulty?: string;
  description?: string;
  tags?: string[];
}

// ===== Request/Response Options =====
export interface SendMessageOptions {
  context?: ChatContext;
  reference?: ProblemReference;
  modelOverride?: string;
  signal?: AbortSignal;
}

// ===== HITL Approval =====
export interface ApprovalActionRequest {
  name: string;
  args?: Record<string, unknown>;
}

export interface ApprovalRequest {
  actionRequests: ApprovalActionRequest[];
  reviewConfigs?: Array<{ actionName: string; allowedDecisions: string[] }>;
}

// ===== Agent Question =====
export interface QuestionRequest {
  question: string;
  options?: string[];
  inputType?: "text" | "choice";
}

// ===== Next Turn Options =====
export interface NextTurnOption {
  label: string;
  message: string;
}

// ===== Stream Callbacks =====
export interface StreamCallbacks {
  onMessageUpdate?: (message: Partial<ChatMessage>, resumeSequence?: number) => void;
  onToolStarted?: (tool: ToolInfo, resumeSequence?: number) => void;
  onRunStatus?: (status: ChatRunStatus, resumeSequence?: number) => void;
  onComplete?: (session: ChatSession, resumeSequence?: number) => void;
  onError?: (error: string, resumeSequence?: number) => void;
  onVerificationReport?: (
    report: VerificationReport,
    resumeSequence?: number,
  ) => void;
  onAwaitingApproval?: (
    request: ApprovalRequest,
    resumeSequence?: number,
  ) => void;
  onAwaitingUserAnswer?: (
    request: QuestionRequest,
    resumeSequence?: number,
  ) => void;
  onNextTurnOptions?: (
    options: NextTurnOption[],
    resumeSequence?: number,
  ) => void;
  onSessionNotice?: (notice: string | null, resumeSequence?: number) => void;
  onTodoItemsUpdate?: (
    items: RunTodoItem[] | null,
    resumeSequence?: number,
  ) => void;
}

// ===== Helper Functions =====
export function getCurrentStage(toolExecutions?: ToolInfo[]): string | null {
  if (!toolExecutions?.length) return null;

  const lastTool = [...toolExecutions].reverse().find((tool) => !!tool.toolName);
  if (!lastTool) return null;

  return `執行中: ${lastTool.toolName}`;
}
