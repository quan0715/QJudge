import type { ChatRun, RunTodoInputItem } from "@/core/types/chatbot.types";

// ===== v2 SSE event shape from ai-service =====
export interface V2StreamEvent {
  type:
  | "run_started"
    | "agent_message_delta"
    | "thinking_delta"
    | "summarization_started"
    | "summarization_ended"
    | "todo_update"
    | "todos_updated"
    | "todo_list_updated"
    | "verification_report"
  | "tool_call_started"
  | "tool_call_finished"
  | "usage_report"
    | "run_completed"
    | "run_failed"
    | "run_cancelled"
    | "awaiting_approval"
    | "awaiting_user_answer";
  seq?: number;
  run_status?: string;

  // run_started
  run_id?: string;

  // agent_message_delta
  content?: string;

  // set on events produced inside a deepagents subagent (`task` tool call id)
  parent_tool_call_id?: string;

  // verification_report
  iteration?: number;
  passed?: boolean;
  issues?: string[];
  summary?: string;

  // tool_call_started
  tool_name?: string;
  tool_call_id?: string;
  input_data?: Record<string, unknown>;

  // tool_call_finished
  result?: string | Record<string, unknown>;
  is_error?: boolean;

  // usage_report
  input_tokens?: number;
  output_tokens?: number;
  model_used?: string;

  // run_failed
  error_code?: string;
  message?: string;

  // awaiting_approval
  action_requests?: Array<{ name: string; args?: Record<string, unknown> }>;
  review_configs?: Array<{ action_name: string; allowed_decisions: string[] }>;
  todos?: RunTodoInputItem[];
  todo_items?: RunTodoInputItem[];

  // awaiting_user_answer
  question?: string;
  options?: string[];
  input_type?: string;

  // run_completed — next_turn_options
  next_turn_options?: Array<{ label: string; message: string }>;

}

// ===== Backend response types =====
export interface BackendMessage {
  ordinal: number;
  run_id: string | null;
  role: string;
  content: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface BackendSessionListItem {
  session_id: string;
  title: string;
  context?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface BackendSession {
  session_id: string;
  title: string;
  messages: BackendMessage[];
  context?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface BackendRun {
  run_id: string;
  session_id: string;
  status: ChatRun["status"];
  kind: ChatRun["kind"];
  model_id: string;
  last_sequence: number;
  pause_payload: NonNullable<ChatRun["approvalPayload"]> & NonNullable<ChatRun["questionPayload"]>;
  error_message?: string;
}
