// ===== Base Types =====
export type ChatRole = "user" | "assistant";


// ===== v2 SSE Event Types =====
export type StreamEventType =
  | "run_started"
  | "agent_message_delta"
  | "thinking_delta"
  | "verification_report"
  | "tool_call_started"
  | "tool_call_finished"
  | "usage_report"
  | "run_completed"
  | "run_failed"
  | "awaiting_approval";

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
    deepagent_thread_id?: string;
    title_pending?: boolean;
    sync_timestamp?: number;
  };
}

export interface StreamEvent extends BaseStreamEvent {
  content?: string;
  thinkingInfo?: ThinkingInfo;
  toolInfo?: ToolInfo;
  userInputRequest?: UserInputRequest;
  metadata?: Record<string, unknown>;
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

// ===== HITL Approval =====
export interface ApprovalActionRequest {
  name: string;
  args?: Record<string, unknown>;
}

export interface ApprovalRequest {
  actionRequests: ApprovalActionRequest[];
  reviewConfigs?: Array<{ actionName: string; allowedDecisions: string[] }>;
}

// ===== Stream Callbacks =====
export interface StreamCallbacks {
  onMessageUpdate?: (message: Partial<ChatMessage>) => void;
  onComplete?: (session: ChatSession) => void;
  onError?: (error: string) => void;
  onUserInputRequest?: (request: UserInputRequest) => void;
  onVerificationReport?: (report: VerificationReport) => void;
  onAwaitingApproval?: (request: ApprovalRequest) => void;
}

// ===== Helper Functions =====
export function getCurrentStage(toolExecutions?: ToolInfo[]): string | null {
  if (!toolExecutions?.length) return null;

  const lastTool = [...toolExecutions].reverse().find((tool) => !!tool.toolName);
  if (!lastTool) return null;

  return `執行中: ${lastTool.toolName}`;
}
