import type {
  CopilotAttachmentPart,
  CopilotCreateSessionInput,
  CopilotError,
  CopilotRequestOptions,
  CopilotRun,
  CopilotRunEvent,
  CopilotRunObserver,
  CopilotSession,
  CopilotSessionSummary,
  CopilotStartRunInput,
  CopilotSubscribeOptions,
  CopilotSubscription,
  CopilotTransport,
  CopilotTransportCapabilities,
} from "@/core/copilot";

interface ObserverEntry extends CopilotSubscription {
  observer: CopilotRunObserver;
}

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

function cloneSession(session: CopilotSession): CopilotSession {
  return {
    ...session,
    createdAt: new Date(session.createdAt),
    updatedAt: new Date(session.updatedAt),
    metadata: session.metadata ? { ...session.metadata } : undefined,
    messages: session.messages.map((message) => ({
      ...message,
      createdAt: new Date(message.createdAt),
      metadata: message.metadata ? { ...message.metadata } : undefined,
      parts: message.parts.map((part) => ({ ...part })),
    })),
  };
}

function toSummary(session: CopilotSession): CopilotSessionSummary {
  const cloned = cloneSession(session);
  return {
    id: cloned.id,
    title: cloned.title,
    createdAt: cloned.createdAt,
    updatedAt: cloned.updatedAt,
    metadata: cloned.metadata,
  };
}

function cloneRun(run: CopilotRun): CopilotRun {
  return { ...run, metadata: run.metadata ? { ...run.metadata } : undefined };
}

function memoryError(
  operation: CopilotError["operation"],
  message: string,
  code: CopilotError["code"] = "transport-error",
): Error & CopilotError {
  return Object.assign(new Error(message), {
    code,
    operation,
    recoverable: false,
  });
}

export class MemoryCopilotTransport implements CopilotTransport {
  readonly capabilities: CopilotTransportCapabilities = {
    resumableStreams: true,
    cancellableRuns: true,
    attachments: true,
    approvals: true,
    questions: true,
  };

  private readonly sessions = new Map<string, CopilotSession>();
  private readonly runs = new Map<string, CopilotRun>();
  private readonly observers = new Map<string, Set<ObserverEntry>>();
  private sessionSequence = 0;
  private runSequence = 0;
  private attachmentSequence = 0;
  private clockSequence = 0;

  private now(): Date {
    return new Date(Date.UTC(2020, 0, 1) + this.clockSequence++);
  }

  async listSessions(
    _options?: CopilotRequestOptions,
  ): Promise<CopilotSessionSummary[]> {
    return [...this.sessions.values()].map(toSummary);
  }

  async getSession(
    id: string,
    _options?: CopilotRequestOptions,
  ): Promise<CopilotSession> {
    const session = this.sessions.get(id);
    if (!session) {
      throw memoryError("load-session", `Unknown session: ${id}`, "not-found");
    }
    return cloneSession(session);
  }

  async createSession(
    input: CopilotCreateSessionInput = {},
  ): Promise<CopilotSession> {
    const id = `session-${++this.sessionSequence}`;
    const createdAt = this.now();
    const session: CopilotSession = {
      id,
      title: input.title ?? "New chat",
      createdAt,
      updatedAt: new Date(createdAt),
      metadata: input.metadata ? { ...input.metadata } : undefined,
      messages: [],
    };
    this.sessions.set(id, session);
    return cloneSession(session);
  }

  async renameSession(
    id: string,
    title: string,
  ): Promise<CopilotSessionSummary> {
    const session = this.sessions.get(id);
    if (!session) {
      throw memoryError("update-session", `Unknown session: ${id}`, "not-found");
    }
    const updated = { ...session, title, updatedAt: this.now() };
    this.sessions.set(id, updated);
    return toSummary(updated);
  }

  async deleteSession(id: string): Promise<void> {
    if (!this.sessions.delete(id)) {
      throw memoryError("update-session", `Unknown session: ${id}`, "not-found");
    }
    for (const [runId, run] of this.runs) {
      if (run.sessionId !== id) continue;
      this.closeObservers(runId);
      this.runs.delete(runId);
    }
  }

  async startRun(input: CopilotStartRunInput): Promise<CopilotRun> {
    if (!this.sessions.has(input.sessionId)) {
      throw memoryError("start-run", `Unknown session: ${input.sessionId}`);
    }
    const run: CopilotRun = {
      id: `run-${++this.runSequence}`,
      sessionId: input.sessionId,
      status: "queued",
      modelId: input.modelId,
      metadata: input.metadata ? { ...input.metadata } : undefined,
    };
    this.runs.set(run.id, run);
    return cloneRun(run);
  }

  async getActiveRun(
    sessionId: string,
    _options?: CopilotRequestOptions,
  ): Promise<CopilotRun | null> {
    const run = [...this.runs.values()].find(
      (candidate) =>
        candidate.sessionId === sessionId &&
        !TERMINAL_STATUSES.has(candidate.status),
    );
    return run ? cloneRun(run) : null;
  }

  subscribeRun(
    run: CopilotRun,
    observer: CopilotRunObserver,
    _options?: CopilotSubscribeOptions,
  ): CopilotSubscription {
    if (!this.runs.has(run.id)) {
      throw memoryError("subscribe-run", `Unknown run: ${run.id}`);
    }
    const entries = this.observers.get(run.id) ?? new Set<ObserverEntry>();
    let isClosed = false;
    const entry: ObserverEntry = {
      observer,
      get closed() {
        return isClosed;
      },
      close: () => {
        if (isClosed) return;
        isClosed = true;
        entries.delete(entry);
        if (entries.size === 0) this.observers.delete(run.id);
      },
    };
    entries.add(entry);
    this.observers.set(run.id, entries);
    return entry;
  }

  async cancelRun(runId: string): Promise<CopilotRun> {
    return this.updateRun(runId, "cancelled", "cancel-run");
  }

  async submitApproval(
    runId: string,
    _decision: "approve" | "reject",
  ): Promise<CopilotRun> {
    return this.updateRun(runId, "running", "submit-approval");
  }

  async submitAnswer(runId: string, _answer: string): Promise<CopilotRun> {
    return this.updateRun(runId, "running", "submit-answer");
  }

  async uploadAttachment(
    sessionId: string,
    file: File,
    _options?: CopilotRequestOptions,
  ): Promise<CopilotAttachmentPart> {
    if (!this.sessions.has(sessionId)) {
      throw memoryError("upload-attachment", `Unknown session: ${sessionId}`);
    }
    return {
      type: "attachment",
      id: `attachment-${++this.attachmentSequence}`,
      name: file.name,
      mediaType: file.type || undefined,
    };
  }

  emit(runId: string, event: CopilotRunEvent): void {
    const run = this.runs.get(runId);
    if (!run) throw memoryError("subscribe-run", `Unknown run: ${runId}`);
    if (event.runId !== runId || event.sessionId !== run.sessionId) {
      throw memoryError("subscribe-run", "Event identifiers do not match the run");
    }
    const nextRun = {
      ...run,
      status: event.type === "run-status" ? event.status : run.status,
      lastSequence: event.sequence,
    };
    this.runs.set(runId, nextRun);

    const entries = [...(this.observers.get(runId) ?? [])];
    for (const entry of entries) {
      if (!entry.closed) entry.observer.next(event);
    }
    if (event.type === "run-status" && TERMINAL_STATUSES.has(event.status)) {
      for (const entry of entries) {
        if (!entry.closed) entry.observer.complete();
        entry.close();
      }
    }
  }

  fail(runId: string, error: CopilotError): void {
    const entries = [...(this.observers.get(runId) ?? [])];
    for (const entry of entries) {
      if (!entry.closed) entry.observer.error(error);
      entry.close();
    }
  }

  private async updateRun(
    runId: string,
    status: CopilotRun["status"],
    operation: CopilotError["operation"],
  ): Promise<CopilotRun> {
    const run = this.runs.get(runId);
    if (!run) throw memoryError(operation, `Unknown run: ${runId}`);
    const updated = { ...run, status };
    this.runs.set(runId, updated);
    return cloneRun(updated);
  }

  private closeObservers(runId: string): void {
    for (const entry of [...(this.observers.get(runId) ?? [])]) entry.close();
  }
}
