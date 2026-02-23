// ===== Base Types =====
export type ChatRole = "user" | "assistant";
export type ChatModel = "haiku" | "sonnet" | "opus";

// ===== Stream Event Base =====
export type StreamEventType =
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
  timestamp: string; // ISO 8601 format
  eventId?: string;
}

// ===== Information Structures =====
export interface ThinkingInfo {
  thinking: string;
  signature: string;
}

export interface ToolInfo {
  toolName: string;
  toolUseId: string;
  inputData?: Record<string, unknown>;
  result?: string | Record<string, unknown>;
  isError?: boolean;
  startTimeMs?: number;
  durationMs?: number;
  skillMetadata?: {
    skill?: string; // e.g., "parse-problem-request"
    gate?: string; // e.g., "gate0"
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
}

export interface SessionContext {
  claudeSessionId?: string;
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
    backend_session_id?: string;      // 後端 UUID（來自初始化事件）
    claude_session_id?: string;        // Claude SDK session ID（來自 session 事件）
    title_pending?: boolean;           // 等待後端生成標題
    sync_timestamp?: number;           // 最後同步時間
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

  // Init event fields
  backendSessionId?: string;
  isNewSession?: boolean;

  // Session event fields
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

// ===== Background Context (replaces BackgroundInformation) =====
export interface UserContext {
  userId?: string;
  userRole?: "student" | "teacher" | "admin";
  preferences?: Record<string, unknown>;
}

export interface PageContext {
  pageType: string; // e.g., "problem_edit", "problem_solve", "contest_view"
  pageUrl?: string;
  pageData?: Record<string, unknown>; // Fully flexible page-related data
}

export interface ChatContext {
  user?: UserContext;
  page?: PageContext;
  custom?: Record<string, unknown>; // Fully flexible custom context
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

// ===== Problem Reference (backward compatible) =====
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
  context?: ChatContext; // New: unified background context
  reference?: ProblemReference; // Legacy: backward compatible
  skill?: string;
  modelOverride?: string;
}

// ===== Stream Callbacks (High-level abstraction) =====
/**
 * 高級 SSE 串流回調接口
 * 將低級 SSE 事件（delta, thinking, tool_start 等）抽象為3個核心回調
 */
export interface StreamCallbacks {
  /**
   * 訊息增量更新（包含所有內容：content, thinking, tools）
   * Repository 會將所有 SSE 事件聚合到這個回調中
   */
  onMessageUpdate?: (message: Partial<ChatMessage>) => void;

  /**
   * 串流完成，返回完整的 session
   * Hook 可以用完整 session 替換本地狀態
   */
  onComplete?: (session: ChatSession) => void;

  /**
   * 錯誤處理
   */
  onError?: (error: string) => void;

  /**
   * 用戶輸入請求（AskUserQuestion）
   */
  onUserInputRequest?: (request: UserInputRequest) => void;
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

/**
 * Extract current stage from tool executions.
 * Stage is inferred from the most recent Skill tool execution's metadata.
 *
 * Example: if toolExecutions has a Skill with skillMetadata.skill="parse-problem-request",
 * returns "Gate 0: 正在解析題目需求" (mapped from predefined stage map).
 */
export function getCurrentStage(toolExecutions?: ToolInfo[]): string | null {
  if (!toolExecutions?.length) return null;

  // Find the most recent Skill tool execution
  const lastSkillExecution = [...toolExecutions]
    .reverse()
    .find((tool) => tool.toolName === "Skill" && tool.skillMetadata);

  if (!lastSkillExecution?.skillMetadata) return null;

  const { skill } = lastSkillExecution.skillMetadata;

  // Map skill names to display text
  const stageMap: Record<string, string> = {
    "parse-problem-request": "Gate 0: 正在解析題目需求",
    "generating-problem": "Gate 1: 正在生成題目內容",
  };

  return stageMap[skill || ""] || `執行中: ${skill || lastSkillExecution.skillMetadata.gate}`;
}
