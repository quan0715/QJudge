// ===== Base Types =====
export type ChatRole = "user" | "assistant";
export type ChatModel = "claude-haiku" | "claude-sonnet" | "claude-opus";

// ===== v2 SSE Event Types =====
export type StreamEventType =
  | "run_started"
  | "agent_message_delta"
  | "thinking_delta"
  | "verification_report"
  | "tool_call_started"
  | "tool_call_finished"
  | "approval_required"
  | "usage_report"
  | "run_completed"
  | "run_failed"
  // Legacy (kept for transition, will be removed in WP-D)
  | "init"
  | "session"
  | "delta"
  | "thinking"
  | "tool_start"
  | "tool_result"
  | "usage"
  | "user_input_request"
  | "done"
  | "error";

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
  toolCallId: string;
  inputData?: Record<string, unknown>;
  result?: string | Record<string, unknown>;
  isError?: boolean;
  // Legacy fields
  toolUseId?: string;
  startTimeMs?: number;
  durationMs?: number;
  skillMetadata?: {
    skill?: string;
    gate?: string;
  };
}

export interface ErrorInfo {
  errorCode?: string;
  errorMessage: string;
  errorDetails?: Record<string, unknown>;
}

export interface UsageInfo {
  inputTokens?: number;
  outputTokens?: number;
  costCents?: number;
  modelUsed?: string;
}

// ===== v2: Verification Report =====
export interface VerificationReport {
  iteration: number;
  passed: boolean;
  issues: string[];
  summary: string;
}

// ===== v2: Pending Action / Approval =====
export interface PendingAction {
  id: string;
  session: string;
  actionType: "create" | "patch";
  targetProblem?: number | null;
  payload: Record<string, unknown>;
  preview: Record<string, unknown>;
  status: "pending" | "confirmed" | "executed" | "cancelled" | "expired" | "failed";
  createdAt: string;
  expiresAt: string;
}

export interface ApprovalRequest {
  actionId: string;
  actionType: "create" | "patch";
  preview: Record<string, unknown>;
}

// ===== v2: Model Info =====
export interface ModelInfo {
  model_id: ChatModel;
  display_name: string;
  description: string;
  is_default: boolean;
}

// ===== Session Context (legacy, kept for backward compat) =====
export interface SessionContext {
  claudeSessionId?: string;
  deepagentThreadId?: string;
  selectedModel?: string;
  activePendingActionId?: string;
  currentStage?: string;
  currentSkill?: string;
  gateData?: Record<string, unknown>;
  customData?: Record<string, unknown>;
}

// ===== Chat Message & Session =====
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: Date;

  // Thinking process (collapsed accordion)
  thinkingInfo?: ThinkingInfo;

  // Tool executions (collapsed accordion with details)
  toolExecutions?: ToolInfo[];

  // v2: Verification reports
  verificationReports?: VerificationReport[];

  // Legacy fields for backward compatibility
  isThinking?: boolean;
  toolName?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  metadata?: {
    backend_session_id?: string;
    claude_session_id?: string;
    deepagent_thread_id?: string;
    title_pending?: boolean;
    sync_timestamp?: number;
  };
}

export interface StreamEvent extends BaseStreamEvent {
  content?: string;
  thinkingInfo?: ThinkingInfo;
  toolInfo?: ToolInfo;
  sessionInfo?: SessionContext;
  userInputRequest?: UserInputRequest;
  errorInfo?: ErrorInfo;
  usageInfo?: UsageInfo;
  metadata?: Record<string, unknown>;

  // v2 fields
  runId?: string;
  threadId?: string;
  verificationReport?: VerificationReport;
  approvalRequest?: ApprovalRequest;

  // Init event fields (legacy)
  backendSessionId?: string;
  isNewSession?: boolean;

  // Session event fields (legacy)
  sessionId?: string;

  // Legacy fields for backward compatibility
  toolName?: string;
  toolInput?: Record<string, unknown>;
  stage?: string;
  skillUsed?: string;
  sessionContext?: SessionContext;
  claudeSessionId?: string;
  tokensUsed?: number;
  error?: string;
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

// Legacy interface (for backward compatibility)
export interface BackgroundInformation {
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
  model?: ChatModel;
  context?: ChatContext;
  reference?: ProblemReference;
  skill?: string;
  modelOverride?: string;
}

// ===== Stream Callbacks =====
export interface StreamCallbacks {
  onMessageUpdate?: (message: Partial<ChatMessage>) => void;
  onComplete?: (session: ChatSession) => void;
  onError?: (error: string) => void;
  onUserInputRequest?: (request: UserInputRequest) => void;
  /** v2: Approval required callback */
  onApprovalRequired?: (request: ApprovalRequest) => void;
  /** v2: Verification report callback */
  onVerificationReport?: (report: VerificationReport) => void;
}

// ===== User Input =====
export interface UserInputOption {
  label: string;
  description: string;
}

export interface UserInputQuestion {
  question: string;
  header: string;
  options: UserInputOption[];
  multiSelect: boolean;
}

export interface UserInputRequest {
  requestId: string;
  questions: UserInputQuestion[];
}

// ===== Helper Functions =====
export function getCurrentStage(toolExecutions?: ToolInfo[]): string | null {
  if (!toolExecutions?.length) return null;

  const lastSkillExecution = [...toolExecutions]
    .reverse()
    .find((tool) => tool.toolName === "Skill" && tool.skillMetadata);

  if (!lastSkillExecution?.skillMetadata) return null;

  const { skill } = lastSkillExecution.skillMetadata;

  const stageMap: Record<string, string> = {
    "parse-problem-request": "Gate 0: 正在解析題目需求",
    "generating-problem": "Gate 1: 正在生成題目內容",
  };

  return stageMap[skill || ""] || `執行中: ${skill || lastSkillExecution.skillMetadata.gate}`;
}
