import type {
  CopilotAttachmentPart,
  CopilotCreateSessionInput,
  CopilotError,
  CopilotRequestOptions,
  CopilotRun,
  CopilotSession,
  CopilotSessionSummary,
  CopilotStartRunInput,
} from "../copilot.types";
import type {
  CopilotRunObserver,
  CopilotSubscribeOptions,
  CopilotSubscription,
} from "../copilotEvent.types";

export interface CopilotTransportCapabilities {
  resumableStreams: boolean;
  cancellableRuns: boolean;
  attachments: boolean;
  approvals: boolean;
  questions: boolean;
}

export interface CopilotTransport {
  readonly capabilities: CopilotTransportCapabilities;

  listSessions(
    options?: CopilotRequestOptions,
  ): Promise<CopilotSessionSummary[]>;
  getSession(
    id: string,
    options?: CopilotRequestOptions,
  ): Promise<CopilotSession>;
  createSession(
    input?: CopilotCreateSessionInput,
    options?: CopilotRequestOptions,
  ): Promise<CopilotSession>;
  renameSession(id: string, title: string): Promise<CopilotSessionSummary>;
  deleteSession(id: string): Promise<void>;

  startRun(input: CopilotStartRunInput): Promise<CopilotRun>;
  getActiveRun?(
    sessionId: string,
    options?: CopilotRequestOptions,
  ): Promise<CopilotRun | null>;
  subscribeRun(
    run: CopilotRun,
    observer: CopilotRunObserver,
    options?: CopilotSubscribeOptions,
  ): CopilotSubscription;
  cancelRun?(runId: string): Promise<CopilotRun>;
  submitApproval?(
    runId: string,
    decision: "approve" | "reject",
  ): Promise<CopilotRun>;
  submitAnswer?(runId: string, answer: string): Promise<CopilotRun>;

  uploadAttachment?(
    sessionId: string,
    file: File,
    options?: CopilotRequestOptions,
  ): Promise<CopilotAttachmentPart>;
}

type CapabilityMethod = {
  capability: keyof CopilotTransportCapabilities;
  method: keyof Pick<
    CopilotTransport,
    | "getActiveRun"
    | "cancelRun"
    | "uploadAttachment"
    | "submitApproval"
    | "submitAnswer"
  >;
  operation: CopilotError["operation"];
};

const CAPABILITY_METHODS: readonly CapabilityMethod[] = [
  {
    capability: "resumableStreams",
    method: "getActiveRun",
    operation: "subscribe-run",
  },
  {
    capability: "cancellableRuns",
    method: "cancelRun",
    operation: "cancel-run",
  },
  {
    capability: "attachments",
    method: "uploadAttachment",
    operation: "upload-attachment",
  },
  {
    capability: "approvals",
    method: "submitApproval",
    operation: "submit-approval",
  },
  {
    capability: "questions",
    method: "submitAnswer",
    operation: "submit-answer",
  },
];

export function assertCopilotTransportCapabilities(
  transport: CopilotTransport,
): void {
  for (const { capability, method, operation } of CAPABILITY_METHODS) {
    if (
      transport.capabilities[capability] &&
      typeof transport[method] !== "function"
    ) {
      const message = `Copilot transport declares ${capability} but does not implement ${method}`;
      const error = Object.assign(new Error(message), {
        code: "unsupported-capability" as const,
        operation,
        recoverable: false,
      }) satisfies Error & CopilotError;
      throw error;
    }
  }
}
