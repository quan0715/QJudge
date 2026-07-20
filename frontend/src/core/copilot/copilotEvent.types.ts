import type {
  CopilotApprovalRequest,
  CopilotError,
  CopilotMessagePart,
  CopilotQuestionRequest,
  CopilotRequestOptions,
  CopilotRunStatus,
} from "./copilot.types";

export interface CopilotSubscribeOptions extends CopilotRequestOptions {
  /** Backend/source cursor to resume after, not normalized event ordering. */
  fromSequence?: number;
}

export interface CopilotSubscription {
  close(): void;
  readonly closed: boolean;
}

export interface CopilotRunObserver {
  next(event: CopilotRunEvent): void;
  error(error: CopilotError): void;
  complete(): void;
}

export type CopilotRunEvent =
  | {
      type: "text-delta" | "reasoning-delta";
      runId: string;
      sessionId: string;
      sequence: number;
      resumeSequence?: number;
      messageId: string;
      delta: string;
    }
  | {
      type: "part-upsert";
      runId: string;
      sessionId: string;
      sequence: number;
      resumeSequence?: number;
      messageId: string;
      part: CopilotMessagePart;
    }
  | {
      type: "awaiting-approval";
      runId: string;
      sessionId: string;
      sequence: number;
      resumeSequence?: number;
      request: CopilotApprovalRequest;
    }
  | {
      type: "awaiting-answer";
      runId: string;
      sessionId: string;
      sequence: number;
      resumeSequence?: number;
      request: CopilotQuestionRequest;
    }
  | {
      type: "run-notice";
      runId: string;
      sessionId: string;
      sequence: number;
      resumeSequence?: number;
      notice: string | null;
    }
  | {
      type: "run-status";
      runId: string;
      sessionId: string;
      sequence: number;
      resumeSequence?: number;
      status: CopilotRunStatus;
      error?: CopilotError;
    };
