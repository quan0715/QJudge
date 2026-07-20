export interface CopilotSessionSummary {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface CopilotModel {
  id: string;
  displayName: string;
  description?: string;
  isDefault?: boolean;
  metadata?: Record<string, unknown>;
}

export type CopilotModelStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error"
  | "unavailable";

export interface CopilotSession extends CopilotSessionSummary {
  messages: CopilotMessage[];
}

export type CopilotActiveSessionState =
  | {
      status: "empty";
      id: null;
      data: null;
      error: null;
    }
  | {
      status: "loading";
      id: string;
      data: CopilotSession | null;
      error: null;
    }
  | {
      status: "ready";
      id: string;
      data: CopilotSession;
      error: null;
    }
  | {
      status: "error";
      id: string | null;
      data: CopilotSession | null;
      error: CopilotError;
    };

export interface CopilotMessage {
  id: string;
  role: "user" | "assistant" | "system";
  parts: CopilotMessagePart[];
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export type CopilotMessagePart =
  | CopilotTextPart
  | CopilotReasoningPart
  | CopilotToolPart
  | CopilotAttachmentPart
  | CopilotDataPart;

export interface CopilotTextPart {
  type: "text";
  text: string;
}

export interface CopilotReasoningPart {
  type: "reasoning";
  text: string;
  state: "streaming" | "complete";
}

export interface CopilotToolPart {
  type: "tool";
  toolCallId: string;
  toolName: string;
  state: "input-streaming" | "input-ready" | "output-ready" | "error";
  input?: unknown;
  output?: unknown;
  error?: CopilotError;
}

export interface CopilotAttachmentPart {
  type: "attachment";
  id: string;
  name: string;
  mediaType?: string;
  url?: string;
}

export interface CopilotDataPart {
  type: `data-${string}`;
  data: unknown;
}

export interface CopilotRun {
  id: string;
  sessionId: string;
  status: CopilotRunStatus;
  modelId?: string;
  lastSequence?: number;
  approvalRequest?: CopilotApprovalRequest;
  questionRequest?: CopilotQuestionRequest;
  metadata?: Record<string, unknown>;
}

export type CopilotRunStatus =
  | "queued"
  | "running"
  | "awaiting-approval"
  | "awaiting-answer"
  | "completed"
  | "failed"
  | "cancelled";

export interface CopilotApprovalRequest {
  actions: Array<{
    name: string;
    arguments?: Record<string, unknown>;
  }>;
  allowedDecisions: Array<"approve" | "reject">;
}

export interface CopilotQuestionRequest {
  question: string;
  input: "text" | "choice";
  options?: string[];
}

export type CopilotRunState =
  | { status: "ready"; run: null }
  | { status: "submitted"; run: CopilotRun }
  | { status: "streaming"; run: CopilotRun }
  | {
      status: "awaiting-approval";
      run: CopilotRun;
      request: CopilotApprovalRequest;
    }
  | {
      status: "awaiting-answer";
      run: CopilotRun;
      request: CopilotQuestionRequest;
    }
  | {
      status: "error";
      run: CopilotRun | null;
      error: CopilotError;
    };

export interface CopilotError {
  code: CopilotErrorCode;
  operation:
    | "load-models"
    | "load-sessions"
    | "load-session"
    | "create-session"
    | "update-session"
    | "start-run"
    | "subscribe-run"
    | "cancel-run"
    | "submit-approval"
    | "submit-answer"
    | "upload-attachment";
  message?: string;
  recoverable: boolean;
  cause?: unknown;
}

export type CopilotErrorCode =
  | "not-found"
  | "forbidden"
  | "transport-error"
  | "validation-error"
  | "stream-disconnected"
  | "stream-sequence-error"
  | "unsupported-capability"
  | "run-failed"
  | "run-timeout"
  | "unknown";

export interface CopilotCreateSessionInput {
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface CopilotSendInput {
  text: string;
  attachments?: readonly File[];
  modelId?: string;
  metadata?: Record<string, unknown>;
}

export interface CopilotStartRunInput {
  sessionId: string;
  text: string;
  attachments?: readonly CopilotAttachmentPart[];
  modelId?: string;
  metadata?: Record<string, unknown>;
}

export interface CopilotSendResult {
  accepted: boolean;
  sessionId: string;
  runId?: string;
  error?: CopilotError;
}

export interface CopilotPendingAttachment {
  id: string;
  file: File;
  status: "pending" | "uploading" | "ready" | "error";
  error?: CopilotError;
}

export interface CopilotRequestOptions {
  signal?: AbortSignal;
}
