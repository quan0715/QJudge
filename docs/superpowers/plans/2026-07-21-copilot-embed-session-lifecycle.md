# Copilot Embedded Chat Lifecycle and Width Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make embedded chat width-safe, delay backend session creation until the first valid send, render a stable skeleton during bootstrap, and remove confirmed legacy leftovers.

**Architecture:** `CopilotProvider` remains the only session/run/composer owner. It exposes an explicit `initializing` active-session state and a side-effect-free `startNew()` command, while an internal guarded create-and-activate path supports lazy first-send creation without changing eager `create()`. QJudge consumes only the public `@copilot` facade and supplies product UI slots; width containment is enforced from the shared shell down to product message content.

**Tech Stack:** React 19, TypeScript 5.9, Vitest 4, Testing Library, Carbon React, Sass/CSS Modules, Storybook 9, Vite 7.

## Global Constraints

- Do not create or publish an npm package in this phase.
- Do not modify backend endpoints, the database schema, or the existing `ChatbotRepository` contract.
- `CopilotProvider` is the only owner of session, run, composer, model, and subscription state.
- QJudge production consumers import Copilot APIs only from `@copilot`; testing utilities come only from `@copilot/testing`.
- Preserve eager `sessions.create()` for AI grading and other programmatic consumers.
- Pressing `+` must not call `transport.createSession()`; the first valid text-or-attachment send creates the session.
- An unsent new-chat draft is in-memory only and is not required to survive a page refresh.
- The message list remains the only vertical scroll owner; wide pre/table/math content may scroll only inside its own message content.
- Do not override `.cds--*` selectors and do not add global `!important` declarations.
- Preserve streaming, HITL, attachment, artifact, model, URL deep-link, and grading behavior.
- Verify only against local services; do not push, deploy, or change remote environments.
- Never read, modify, stage, or commit `ai-service/.deepagents/skills/rubric.md` or `ai-service/.deepagents/tmp_grade.csv`.
- The UI skill references `frontend/src/features/storybook/registry/index.ts`, but this repository has no Storybook registry; the existing `src/**/*.stories.tsx` discovery glob owns registration, so do not invent a new registry in this change.

---

## File Structure

### Package candidate

- `frontend/src/core/copilot/copilot.types.ts`: public discriminated union; add `initializing`.
- `frontend/src/shared/copilot/react/CopilotProvider.tsx`: bootstrap derivation, new-session intent, eager/lazy creation, concurrency guards.
- `frontend/src/shared/copilot/react/copilotContexts.ts`: public session command context; add `startNew()`.
- `frontend/src/shared/copilot/hooks/useCopilotSessions.ts`: expose `startNew()` through the public hook.
- `frontend/src/shared/copilot/ui/CopilotPanel.tsx`: route new-chat UI to `startNew()` and prioritize loading over empty state.
- `frontend/src/shared/copilot/ui/copilot.css`: shared shell width chain.
- `frontend/type-tests/copilot.types.typecheck.ts`: compile-time state-union assertions.
- `frontend/type-tests/copilot.public-api.typecheck.ts`: compile-time `startNew()` contract.

### QJudge dogfood integration

- `frontend/src/features/chatbot/contexts/QJudgeCopilotProvider.tsx`: use `initialSession="first"`.
- `frontend/src/features/chatbot/components/chat-ui/QJudgeCopilotSlotComponents.tsx`: consume public callbacks/states and allow composer input in confirmed empty state.
- `frontend/src/features/chatbot/components/chat-ui/ChatTopBar.tsx`: title skeleton during initialization/loading.
- `frontend/src/features/chatbot/components/chat-ui/MessageList.tsx`: treat `initializing` as loading.
- `frontend/src/features/chatbot/components/chat-ui/ChatContainer.module.scss`: container width chain and dead-selector cleanup.
- `frontend/src/features/chatbot/components/chat-ui/MessageList.module.scss`: list/skeleton border-box containment.
- `frontend/src/features/chatbot/components/chat-ui/MessageBubble.module.scss`: message and Markdown local overflow rules.
- `frontend/src/features/chatbot/components/chat-ui/ComposerBar.module.scss`: composer border-box containment.
- `frontend/src/features/app/components/SideMenu.tsx`: start an in-memory new chat and navigate without a session query.
- `frontend/src/features/chatbot/components/chat-ui/__stories__/MessageBubble.stories.tsx`: reproducible narrow overflow stress story.

### Legacy cleanup

- Delete `frontend/src/features/chatbot/hooks/useChatScrollToBottom.ts`.
- `frontend/src/features/chatbot/contexts/ArtifactPanelContext.tsx`: remove the unused deprecated `sessionId` prop.
- `frontend/src/infrastructure/copilot/qJudgeCopilotTransport.ts`: rename misleading `legacyRuns` storage.

---

### Task 1: Represent bootstrap as an explicit active-session state

**Files:**
- Modify: `frontend/src/core/copilot/copilot.types.ts`
- Modify: `frontend/src/shared/copilot/react/CopilotProvider.tsx`
- Modify: `frontend/src/shared/copilot/react/CopilotProvider.test.tsx`
- Modify: `frontend/type-tests/copilot.types.typecheck.ts`

**Interfaces:**
- Consumes: existing `CopilotSessionListStatus` and `selectActiveSession()`.
- Produces: `CopilotActiveSessionState` branch `{ status: "initializing"; id: null; data: null; error: null }`.

- [ ] **Step 1: Add runtime and compile-time failing tests**

Append this case inside the existing `describe("CopilotProvider session lifecycle", () => {` block in `CopilotProvider.test.tsx`:

```tsx
it("exposes initializing before the first session list resolves", async () => {
  const transport = new MemoryCopilotTransport();
  const pendingList = deferred<CopilotSessionSummary[]>();
  vi.spyOn(transport, "listSessions").mockReturnValueOnce(pendingList.promise);
  const { result } = renderHook(() => useCopilotSessions(), {
    wrapper: createWrapper({ transport, initialSession: "first" }),
  });

  expect(result.current.activeSession).toEqual({
    status: "initializing",
    id: null,
    data: null,
    error: null,
  });

  await act(async () => {
    pendingList.resolve([]);
    await pendingList.promise;
  });

  await waitFor(() => expect(result.current.listStatus).toBe("ready"));
  expect(result.current.activeSession).toEqual({
    status: "empty",
    id: null,
    data: null,
    error: null,
  });
});
```

Add these declarations to `frontend/type-tests/copilot.types.typecheck.ts`:

```ts
const initializing: CopilotActiveSessionState = {
  status: "initializing",
  id: null,
  data: null,
  error: null,
};
void initializing;

// @ts-expect-error initializing cannot carry a persisted session id
const invalidInitializing: CopilotActiveSessionState = {
  status: "initializing",
  id: "session-1",
  data: null,
  error: null,
};
void invalidInitializing;
```

- [ ] **Step 2: Run the tests and verify red**

Run:

```bash
cd frontend
npm test -- --run src/shared/copilot/react/CopilotProvider.test.tsx
npm run typecheck:copilot
```

Expected: Vitest fails because the first render is `empty`; TypeScript fails because `"initializing"` is not part of `CopilotActiveSessionState` and the `@ts-expect-error` assertion is not aligned yet.

- [ ] **Step 3: Add the state branch and Provider derivation**

Add this branch before `empty` in `CopilotActiveSessionState`:

```ts
  | {
      status: "initializing";
      id: null;
      data: null;
      error: null;
    }
```

Add this constant next to `EMPTY_ACTIVE_SESSION` in `CopilotProvider.tsx`:

```ts
const INITIALIZING_ACTIVE_SESSION = {
  status: "initializing",
  id: null,
  data: null,
  error: null,
} as const;
```

Replace the current `activeSession` derivation near the context values with:

```ts
const selectedActiveSession = runtimeIsVisible
  ? selectActiveSession(runtime, activeError)
  : EMPTY_ACTIVE_SESSION;
const activeSession =
  runtimeIsVisible &&
  enabled &&
  selectedActiveSession.status === "empty" &&
  (listStatus === "idle" || listStatus === "loading")
    ? INITIALIZING_ACTIVE_SESSION
    : selectedActiveSession;
```

Keep disabled providers on `EMPTY_ACTIVE_SESSION`; only enabled bootstrap is `initializing`.

- [ ] **Step 4: Run focused state tests**

Run:

```bash
cd frontend
npm test -- --run src/core/copilot/copilotSelectors.test.ts src/shared/copilot/react/CopilotProvider.test.tsx
npm run typecheck:copilot
```

Expected: all selected tests and compile-time assertions pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/core/copilot/copilot.types.ts frontend/src/shared/copilot/react/CopilotProvider.tsx frontend/src/shared/copilot/react/CopilotProvider.test.tsx frontend/type-tests/copilot.types.typecheck.ts
git commit -m "feat(copilot): expose session initialization state"
```

### Task 2: Add a side-effect-free `startNew()` session command

**Files:**
- Modify: `frontend/src/shared/copilot/react/copilotContexts.ts`
- Modify: `frontend/src/shared/copilot/hooks/useCopilotSessions.ts`
- Modify: `frontend/src/shared/copilot/react/CopilotProvider.tsx`
- Modify: `frontend/src/shared/copilot/react/CopilotProvider.test.tsx`
- Modify: `frontend/type-tests/copilot.public-api.typecheck.ts`

**Interfaces:**
- Consumes: `closeRunSubscription()`, `writeLocation()`, `LAST_SESSION_KEY`, composer state setters.
- Produces: `UseCopilotSessionsResult.startNew(): void` and runtime-owned new-session intent.

- [ ] **Step 1: Write failing lifecycle tests**

Add this test to `CopilotProvider.test.tsx`:

```tsx
it("starts an unsaved new chat without creating a transport session", async () => {
  const transport = new MemoryCopilotTransport();
  const existing = await transport.createSession({ title: "Existing" });
  const createSession = vi.spyOn(transport, "createSession");
  const location = new MemoryCopilotSessionLocation(existing.id);
  const storage = new MemoryCopilotStorage([
    ["copilot:last-session-id", existing.id],
  ]);
  const { result } = renderHook(
    () => ({
      sessions: useCopilotSessions(),
      composer: useCopilotComposer(),
    }),
    {
      wrapper: createWrapper({
        transport,
        sessionLocation: location,
        storage,
        initialSession: "first",
      }),
    },
  );
  await waitFor(() =>
    expect(result.current.sessions.activeSession.id).toBe(existing.id),
  );
  act(() => result.current.composer.setDraft("discard me"));
  await act(() =>
    result.current.composer.addAttachments([
      new File(["draft"], "draft.txt", { type: "text/plain" }),
    ]),
  );

  act(() => result.current.sessions.startNew());

  expect(createSession).not.toHaveBeenCalled();
  expect(result.current.sessions.activeSession.status).toBe("empty");
  expect(result.current.sessions.sessions.map((item) => item.id)).toContain(
    existing.id,
  );
  expect(result.current.composer.draft).toBe("");
  expect(result.current.composer.attachments).toEqual([]);
  expect(location.get()).toBeNull();
  expect(storage.get("copilot:last-session-id")).toBeNull();

  await act(() => result.current.sessions.refresh());
  expect(result.current.sessions.activeSession.status).toBe("empty");
  expect(result.current.sessions.activeSession.id).toBeNull();
});
```

Add a subscription ownership test:

```tsx
it("stops observing the old run without cancelling it when a new chat starts", async () => {
  const transport = new MemoryCopilotTransport();
  const session = await transport.createSession();
  await transport.startRun({ sessionId: session.id, text: "background" });
  const subscribeRun = vi.spyOn(transport, "subscribeRun");
  const cancelRun = vi.spyOn(transport, "cancelRun");
  const { result } = renderHook(() => useCopilotSessions(), {
    wrapper: createWrapper({ transport, initialSession: "first" }),
  });
  await waitFor(() => expect(subscribeRun).toHaveBeenCalledTimes(1));
  const subscription = subscribeRun.mock.results[0].value;

  act(() => result.current.startNew());

  expect(subscription.closed).toBe(true);
  expect(cancelRun).not.toHaveBeenCalled();
  expect(result.current.activeSession.status).toBe("empty");
});
```

Add this compile-time call to `copilot.public-api.typecheck.ts`:

```ts
sessionRuntime.startNew();
```

- [ ] **Step 2: Run the tests and verify red**

Run:

```bash
cd frontend
npm test -- --run src/shared/copilot/react/CopilotProvider.test.tsx
npm run typecheck:copilot
```

Expected: TypeScript/Vitest fail because `startNew` is absent.

- [ ] **Step 3: Add the public command and runtime-owned intent**

Add this member to both `CopilotSessionCommandsContextValue` and `UseCopilotSessionsResult`:

```ts
startNew(): void;
```

Add these refs beside the existing request/subscription refs in `CopilotProvider.tsx`:

```ts
const newSessionIntentRef = useRef(false);
```

Reset it inside `resetRuntimeOwnership()`:

```ts
newSessionIntentRef.current = false;
```

At the start of `selectSession()`, after the enabled guard, clear the intent:

```ts
newSessionIntentRef.current = false;
```

Add this callback before `create`:

```ts
const startNew = useCallback(() => {
  if (!enabledRef.current) return;
  newSessionIntentRef.current = true;
  ++revisionRef.current;
  closeRunSubscription();
  activeIdRef.current = null;
  lastSendRef.current = null;
  setActiveError(null);
  setSessionError(null);
  setDraft("");
  setAttachments([]);
  storage?.remove(LAST_SESSION_KEY);
  writeLocation(null);
  setRuntime((previous) => ({
    ...previous,
    activeSessionId: null,
  }));
}, [closeRunSubscription, storage, writeLocation]);
```

Change both bootstrap checks that currently start with `if (activeIdRef.current === null)` so they also respect the intent:

```ts
if (activeIdRef.current === null && !newSessionIntentRef.current) {
```

Update the Task 1 initializing derivation so a deliberate draft remains `empty` during a background list refresh:

```ts
const activeSession =
  runtimeIsVisible &&
  enabled &&
  !newSessionIntentRef.current &&
  selectedActiveSession.status === "empty" &&
  (listStatus === "idle" || listStatus === "loading")
    ? INITIALIZING_ACTIVE_SESSION
    : selectedActiveSession;
```

Add `startNew` to `commandsValue` and its dependency array:

```ts
const commandsValue = useMemo(
  () => ({
    create,
    startNew,
    select: selectSession,
    rename,
    remove,
    refresh,
    clearError: clearSessionError,
  }),
  [clearSessionError, create, refresh, remove, rename, selectSession, startNew],
);
```

- [ ] **Step 4: Run lifecycle and public type tests**

Run:

```bash
cd frontend
npm test -- --run src/shared/copilot/react/CopilotProvider.test.tsx
npm run typecheck:copilot
```

Expected: all tests pass; `startNew()` is callable through `useCopilotSessions()`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/shared/copilot/react/copilotContexts.ts frontend/src/shared/copilot/hooks/useCopilotSessions.ts frontend/src/shared/copilot/react/CopilotProvider.tsx frontend/src/shared/copilot/react/CopilotProvider.test.tsx frontend/type-tests/copilot.public-api.typecheck.ts
git commit -m "feat(copilot): add unsaved new chat state"
```

### Task 3: Lazily create a session from the first valid send

**Files:**
- Modify: `frontend/src/shared/copilot/react/CopilotProvider.tsx`
- Modify: `frontend/src/shared/copilot/react/CopilotProvider.test.tsx`

**Interfaces:**
- Consumes: `startNew()`, `CopilotSendInput`, eager `create()` contract.
- Produces: one shared lazy-create path for `useCopilot().send()` and `useCopilotComposer().send()`.

- [ ] **Step 1: Write failing lazy-create tests**

Add these tests to `CopilotProvider.test.tsx`:

```tsx
it("creates exactly one session when the first draft is sent", async () => {
  const transport = new MemoryCopilotTransport();
  const createSession = vi.spyOn(transport, "createSession");
  const startRun = vi.spyOn(transport, "startRun");
  const location = new MemoryCopilotSessionLocation();
  const { result } = renderHook(
    () => ({
      sessions: useCopilotSessions(),
      composer: useCopilotComposer(),
    }),
    {
      wrapper: createWrapper({
        transport,
        sessionLocation: location,
        initialSession: "first",
      }),
    },
  );
  await waitFor(() =>
    expect(result.current.sessions.activeSession.status).toBe("empty"),
  );
  act(() => result.current.composer.setDraft("First message"));
  await waitFor(() => expect(result.current.composer.canSend).toBe(true));

  let sendResult;
  await act(async () => {
    sendResult = await result.current.composer.send();
  });

  expect(sendResult).toMatchObject({ accepted: true, sessionId: "session-1" });
  expect(createSession).toHaveBeenCalledTimes(1);
  expect(startRun).toHaveBeenCalledWith(
    expect.objectContaining({
      sessionId: "session-1",
      text: "First message",
    }),
  );
  expect(location.get()).toBe("session-1");
  expect(result.current.sessions.activeSession.id).toBe("session-1");
});

it("uses the lazily created session for attachment upload and run start", async () => {
  const transport = new MemoryCopilotTransport();
  const uploadAttachment = vi.spyOn(transport, "uploadAttachment");
  const startRun = vi.spyOn(transport, "startRun");
  const { result } = renderHook(() => useCopilotComposer(), {
    wrapper: createWrapper({ transport, initialSession: "first" }),
  });
  await waitFor(() => expect(result.current.isSending).toBe(false));
  const file = new File(["content"], "first.txt", { type: "text/plain" });
  await act(() => result.current.addAttachments([file]));
  await waitFor(() => expect(result.current.canSend).toBe(true));

  await act(() => result.current.send());

  expect(uploadAttachment).toHaveBeenCalledWith("session-1", file);
  expect(startRun).toHaveBeenCalledWith(
    expect.objectContaining({ sessionId: "session-1" }),
  );
});

it("keeps the unsaved draft and attachment when lazy create fails", async () => {
  const transport = new MemoryCopilotTransport();
  vi.spyOn(transport, "createSession").mockRejectedValueOnce(
    new Error("create offline"),
  );
  const startRun = vi.spyOn(transport, "startRun");
  const { result } = renderHook(
    () => ({
      sessions: useCopilotSessions(),
      composer: useCopilotComposer(),
    }),
    { wrapper: createWrapper({ transport, initialSession: "first" }) },
  );
  await waitFor(() =>
    expect(result.current.sessions.activeSession.status).toBe("empty"),
  );
  const file = new File(["retry"], "retry.txt", { type: "text/plain" });
  act(() => result.current.composer.setDraft("Retry me"));
  await act(() => result.current.composer.addAttachments([file]));

  let sendResult;
  await act(async () => {
    sendResult = await result.current.composer.send();
  });

  expect(sendResult).toMatchObject({
    accepted: false,
    sessionId: "",
    error: { operation: "create-session" },
  });
  expect(startRun).not.toHaveBeenCalled();
  expect(result.current.sessions.activeSession.status).toBe("empty");
  expect(result.current.composer.draft).toBe("Retry me");
  expect(result.current.composer.attachments).toEqual([
    expect.objectContaining({ file, status: "pending" }),
  ]);
});

it("shares one lazy create across duplicate composer submissions", async () => {
  const transport = new MemoryCopilotTransport();
  const pendingCreate = deferred<CopilotSession>();
  const originalCreate = transport.createSession.bind(transport);
  const createSession = vi
    .spyOn(transport, "createSession")
    .mockReturnValueOnce(pendingCreate.promise);
  const { result } = renderHook(() => useCopilotComposer(), {
    wrapper: createWrapper({ transport, initialSession: "first" }),
  });
  await waitFor(() => expect(result.current.isSending).toBe(false));
  act(() => result.current.setDraft("Only once"));

  let first!: ReturnType<typeof result.current.send>;
  let second!: ReturnType<typeof result.current.send>;
  act(() => {
    first = result.current.send();
    second = result.current.send();
  });
  expect(createSession).toHaveBeenCalledTimes(1);

  const created = await originalCreate();
  await act(async () => {
    pendingCreate.resolve(created);
    const results = await Promise.all([first, second]);
    expect(results[0]).toEqual(results[1]);
  });
  expect(createSession).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the Provider test and verify red**

Run:

```bash
cd frontend
npm test -- --run src/shared/copilot/react/CopilotProvider.test.tsx
```

Expected: empty composer cannot send and `send()` returns validation error without creating a session.

- [ ] **Step 3: Refactor eager creation into a reusable guarded outcome**

Add this module-level type near the Provider props:

```ts
type CreateSessionOutcome =
  | { ok: true; sessionId: string; activated: boolean }
  | { ok: false; error: CopilotError };
```

Add this ref beside `composerSendInFlightRef`:

```ts
const lazyCreateInFlightRef = useRef<Promise<CreateSessionOutcome> | null>(null);
```

Reset it in `resetRuntimeOwnership()`:

```ts
lazyCreateInFlightRef.current = null;
```

Replace the existing `create` callback with the following pair:

```ts
const createAndActivate = useCallback(
  async (input?: CopilotCreateSessionInput): Promise<CreateSessionOutcome> => {
    if (!enabledRef.current) {
      return {
        ok: false,
        error: ownershipChangedError("create-session"),
      };
    }
    const ownershipEpoch = ownershipEpochRef.current;
    const startedRevision = revisionRef.current;
    const startedListRequestRevision =
      sessionListRequestRevisionRef.current;
    try {
      const session = await transport.createSession(input);
      if (
        !enabledRef.current ||
        ownershipEpoch !== ownershipEpochRef.current
      ) {
        return {
          ok: false,
          error: ownershipChangedError("create-session"),
        };
      }
      if (
        startedListRequestRevision === sessionListRequestRevisionRef.current
      ) {
        invalidateSessionListRequest();
        setListStatus("ready");
      }
      setSessionError(null);
      const summary = summaryFromSession(session);
      replaceSessions([
        summary,
        ...sessionsRef.current.filter((item) => item.id !== session.id),
      ]);
      if (startedRevision !== revisionRef.current) {
        return { ok: true, sessionId: session.id, activated: false };
      }
      ++revisionRef.current;
      newSessionIntentRef.current = false;
      closeRunSubscription();
      activeIdRef.current = session.id;
      setActiveError(null);
      setRuntime((previous) => ({
        ...previous,
        activeSessionId: session.id,
        sessions: { ...previous.sessions, [session.id]: session },
        runs: {
          ...previous.runs,
          [session.id]: { status: "ready", run: null },
        },
      }));
      storage?.set(LAST_SESSION_KEY, session.id);
      writeLocation(session.id);
      return { ok: true, sessionId: session.id, activated: true };
    } catch (cause) {
      if (
        !enabledRef.current ||
        ownershipEpoch !== ownershipEpochRef.current
      ) {
        return {
          ok: false,
          error: ownershipChangedError("create-session"),
        };
      }
      const error = toSessionError("create-session", cause);
      setSessionError(error);
      return { ok: false, error };
    }
  },
  [
    closeRunSubscription,
    invalidateSessionListRequest,
    replaceSessions,
    storage,
    transport,
    writeLocation,
  ],
);

const create = useCallback(
  async (input?: CopilotCreateSessionInput): Promise<string | null> => {
    const outcome = await createAndActivate(input);
    return outcome.ok ? outcome.sessionId : null;
  },
  [createAndActivate],
);
```

Add this internal callback after `create`:

```ts
const ensureSessionForSend = useCallback(async (): Promise<CreateSessionOutcome> => {
  const existingId = activeIdRef.current;
  if (existingId) {
    return { ok: true, sessionId: existingId, activated: true };
  }
  if (lazyCreateInFlightRef.current) {
    return lazyCreateInFlightRef.current;
  }
  const pending = createAndActivate();
  lazyCreateInFlightRef.current = pending;
  const clear = () => {
    if (lazyCreateInFlightRef.current === pending) {
      lazyCreateInFlightRef.current = null;
    }
  };
  void pending.then(clear, clear);
  return pending;
}, [createAndActivate]);
```

- [ ] **Step 4: Make `send()` validate first and then ensure a session**

Replace the complete `send` callback with:

```ts
const send = useCallback(
  async (input: CopilotSendInput): Promise<CopilotSendResult> => {
    const text = input.text.trim();
    if (!text && !input.attachments?.length) {
      return {
        accepted: false,
        sessionId: activeIdRef.current ?? "",
        error: {
          code: "validation-error",
          operation: "start-run",
          recoverable: true,
        },
      };
    }
    if (!enabledRef.current) {
      return {
        accepted: false,
        sessionId: activeIdRef.current ?? "",
        error: ownershipChangedError("start-run"),
      };
    }

    const ensured = await ensureSessionForSend();
    if (!ensured.ok) {
      return { accepted: false, sessionId: "", error: ensured.error };
    }
    const sessionId = ensured.sessionId;
    if (!ensured.activated || activeIdRef.current !== sessionId) {
      return {
        accepted: false,
        sessionId,
        error: ownershipChangedError("start-run"),
      };
    }

    const ownershipEpoch = ownershipEpochRef.current;
    const revision = revisionRef.current;
    const isCurrentSend = () =>
      enabledRef.current &&
      ownershipEpoch === ownershipEpochRef.current &&
      revision === revisionRef.current &&
      activeIdRef.current === sessionId;
    const staleResult = (): CopilotSendResult => ({
      accepted: false,
      sessionId,
      error: ownershipChangedError("start-run"),
    });

    const uploaded: CopilotAttachmentPart[] = [];
    for (const file of input.attachments ?? []) {
      if (!isCurrentSend()) return staleResult();
      if (!transport.capabilities.attachments || !transport.uploadAttachment) {
        const error: CopilotError = {
          code: "unsupported-capability",
          operation: "upload-attachment",
          recoverable: false,
        };
        return { accepted: false, sessionId, error };
      }
      setAttachments((items) =>
        items.map((item) =>
          item.file === file
            ? { ...item, status: "uploading", error: undefined }
            : item,
        ),
      );
      try {
        const uploadedPart = await transport.uploadAttachment(sessionId, file);
        if (!isCurrentSend()) return staleResult();
        uploaded.push(uploadedPart);
        setAttachments((items) =>
          items.map((item) =>
            item.file === file
              ? { ...item, status: "ready", error: undefined }
              : item,
          ),
        );
      } catch (cause) {
        if (!isCurrentSend()) return staleResult();
        const error = toCopilotError("upload-attachment", cause);
        setAttachments((items) =>
          items.map((item) =>
            item.file === file ? { ...item, status: "error", error } : item,
          ),
        );
        lastSendRef.current = { ...input };
        return { accepted: false, sessionId, error };
      }
    }

    if (!isCurrentSend()) return staleResult();

    const optimisticId =
      (input as CopilotSendInput & { optimisticId?: string }).optimisticId ??
      `copilot-user-${++optimisticSequence}`;
    const optimisticMessage: CopilotMessage = {
      id: optimisticId,
      role: "user",
      createdAt: new Date(),
      parts: [
        ...(text ? [{ type: "text" as const, text }] : []),
        ...uploaded,
      ],
      metadata: { ...input.metadata, optimistic: true },
    };
    setRuntime((previous) => {
      const session = previous.sessions[sessionId];
      if (
        !session ||
        session.messages.some((message) => message.id === optimisticId)
      ) {
        return previous;
      }
      return {
        ...previous,
        sessions: {
          ...previous.sessions,
          [sessionId]: {
            ...session,
            messages: [...session.messages, optimisticMessage],
          },
        },
      };
    });
    lastSendRef.current = { ...input, text, optimisticId };

    try {
      const run = await transport.startRun({
        sessionId,
        text,
        attachments: uploaded,
        modelId: input.modelId,
        metadata: input.metadata,
      });
      if (!isCurrentSend()) return staleResult();
      syncSessionSummaryRun(sessionId, run);
      const assistantId =
        run.assistantMessageId ?? `run-${run.id}-assistant`;
      setRuntime((previous) => {
        const session = previous.sessions[sessionId];
        if (!session) return previous;
        const assistant: CopilotMessage = {
          id: assistantId,
          role: "assistant",
          createdAt: new Date(),
          parts: [{ type: "reasoning", text: "", state: "streaming" }],
          metadata: { optimistic: true, runId: run.id },
        };
        return {
          ...previous,
          sessions: {
            ...previous.sessions,
            [sessionId]: {
              ...session,
              messages: session.messages.some(
                (message) => message.id === assistantId,
              )
                ? session.messages
                : [...session.messages, assistant],
            },
          },
          runs: {
            ...previous.runs,
            [sessionId]: { status: "submitted", run },
          },
        };
      });
      subscribeToRun(run);
      return { accepted: true, sessionId, runId: run.id };
    } catch (cause) {
      if (!isCurrentSend()) return staleResult();
      const error = toCopilotError("start-run", cause);
      setRunState(sessionId, { status: "error", run: null, error });
      return { accepted: false, sessionId, error };
    }
  },
  [
    ensureSessionForSend,
    setRunState,
    subscribeToRun,
    syncSessionSummaryRun,
    transport,
  ],
);
```

Change `canSend` so confirmed empty state is allowed:

```ts
const sessionAcceptsInput =
  activeSession.status === "ready" || activeSession.status === "empty";
const canSend =
  runtimeIsVisible &&
  enabled &&
  sessionAcceptsInput &&
  (run.status === "ready" || run.status === "error") &&
  !isComposerSending &&
  (draft.trim().length > 0 || attachments.length > 0);
```

- [ ] **Step 5: Run the Provider and run-lifecycle suites**

Run:

```bash
cd frontend
npm test -- --run src/shared/copilot/react/CopilotProvider.test.tsx src/shared/copilot/react/CopilotRunProvider.test.tsx
npm run typecheck:copilot
```

Expected: all tests pass, including existing eager create, stale send, upload retry, and duplicate submission tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/shared/copilot/react/CopilotProvider.tsx frontend/src/shared/copilot/react/CopilotProvider.test.tsx
git commit -m "feat(copilot): create sessions on first send"
```

### Task 4: Route every QJudge new-chat entry through `startNew()`

**Files:**
- Modify: `frontend/src/shared/copilot/ui/CopilotPanel.tsx`
- Modify: `frontend/src/features/chatbot/contexts/QJudgeCopilotProvider.tsx`
- Modify: `frontend/src/features/chatbot/contexts/QJudgeCopilotProvider.test.tsx`
- Modify: `frontend/src/features/chatbot/components/chat-ui/QJudgeCopilotSlotComponents.tsx`
- Modify: `frontend/src/features/chatbot/components/chat-ui/QJudgeChatPanel.test.tsx`
- Modify: `frontend/src/features/app/components/SideMenu.tsx`
- Modify: `frontend/src/features/app/components/SideMenu.test.tsx`

**Interfaces:**
- Consumes: `useCopilotSessions().startNew()` and lazy send from Task 3.
- Produces: no user-visible `+` action performs eager creation; QJudge boots with `first`.

- [ ] **Step 1: Change QJudge boundary tests to require an empty first session**

Replace the first boundary test in `QJudgeCopilotProvider.test.tsx` with:

```tsx
it("keeps a new account empty until the first message is sent", async () => {
  const transport = new MemoryCopilotTransport();
  const createSession = vi.spyOn(transport, "createSession");
  const wrapper = ({ children }: PropsWithChildren) => (
    <QJudgeCopilotBoundary
      enabled
      transport={transport}
      location={new MemoryCopilotSessionLocation()}
      storage={new MemoryCopilotStorage()}
      translations={new DefaultCopilotTranslations()}
      modelCatalog={new MemoryCopilotModelCatalog()}
      fallbackModels={[]}
    >
      {children}
    </QJudgeCopilotBoundary>
  );

  const { result } = renderHook(() => useCopilotSessions(), { wrapper });
  await waitFor(() =>
    expect(result.current.activeSession.status).toBe("empty"),
  );
  expect(result.current.sessions).toHaveLength(0);
  expect(createSession).not.toHaveBeenCalled();
});
```

In the artifact-owner test, replace its final session wait with:

```tsx
await waitFor(() =>
  expect(result.current.sessions.activeSession.status).toBe("empty"),
);
expect(result.current.sessions.sessions).toHaveLength(0);
expect(result.current.artifacts.isOpen).toBe(false);
```

In the authenticated-provider test, replace the final assertions with:

```tsx
await waitFor(() =>
  expect(result.current.activeSession.status).toBe("empty"),
);
expect(result.current.sessions).toHaveLength(0);
```

- [ ] **Step 2: Change the SideMenu test to require navigation without creation**

Add `startNew: vi.fn()` to `mockCopilotSessions`, clear it in `beforeEach`, and replace the eager-create test with:

```tsx
it("starts a local new chat and removes the session query", async () => {
  render(
    <MemoryRouter initialEntries={["/chat?ai_session_id=session-1"]}>
      <SideMenu variant="panel" />
      <LocationProbe />
    </MemoryRouter>,
  );

  fireEvent.click(await screen.findByText("ui.newChat"));

  expect(mockCopilotSessions.startNew).toHaveBeenCalledTimes(1);
  expect(mockCopilotSessions.create).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(screen.getByTestId("location-search")).toHaveTextContent(""),
  );
});
```

- [ ] **Step 3: Add a QJudge panel first-send integration test**

Change `renderPanel` so its `sessionId` parameter is `string | null`. Add:

```tsx
it("does not create from the new-chat button and creates on first send", async () => {
  const transport = new MemoryCopilotTransport();
  const existing = await transport.createSession({ title: "Existing" });
  const createSession = vi.spyOn(transport, "createSession");
  const startRun = vi.spyOn(transport, "startRun");
  const location = new MemoryCopilotSessionLocation(existing.id);
  renderPanel(
    transport,
    existing.id,
    <QJudgeChatPanel mode="sidebar" />,
    new MemoryCopilotModelCatalog(),
    location,
  );

  fireEvent.click(await screen.findByRole("button", { name: /new|新增/i }));
  expect(createSession).not.toHaveBeenCalled();
  await waitFor(() => expect(location.get()).toBeNull());

  const input = screen.getByRole("textbox", { name: /message|輸入/i });
  await waitFor(() => expect(input).toBeEnabled());
  fireEvent.change(input, { target: { value: "First embedded message" } });
  fireEvent.click(screen.getByRole("button", { name: /send|送出/i }));

  await waitFor(() => expect(createSession).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(startRun).toHaveBeenCalledWith(
      expect.objectContaining({ text: "First embedded message" }),
    ),
  );
});
```

- [ ] **Step 4: Run the integration tests and verify red**

Run:

```bash
cd frontend
npm test -- --run src/features/chatbot/contexts/QJudgeCopilotProvider.test.tsx src/features/chatbot/components/chat-ui/QJudgeChatPanel.test.tsx src/features/app/components/SideMenu.test.tsx
```

Expected: tests fail because QJudge still uses `first-or-create` and the UI still calls `create()`.

- [ ] **Step 5: Rewire the public panel and QJudge consumers**

In `CopilotPanel.tsx`, replace all three user-facing create callbacks:

```tsx
onNewSession={sessions.startNew}
```

```tsx
onCreate={sessions.startNew}
```

```tsx
<Empty onNewSession={sessions.startNew} />
```

In `QJudgeCopilotProvider.tsx`, set:

```tsx
initialSession="first"
```

Change `QJudgeCopilotHeader` to consume the public callback and allow empty composer input:

```tsx
export function QJudgeCopilotHeader({
  activeSession,
  onNewSession,
}: CopilotHeaderProps) {
  const sessions = useCopilotSessions();
  const { mode, onClose } = useContext(QJudgeChatPresentationContext);
  const title = activeSession.data?.title;

  return (
    <ChatTopBar
      mode="full"
      hideSidebarControl={mode === "sidebar"}
      title={title}
      sessions={sessions.sessions}
      currentSessionId={activeSession.id}
      onSelectSession={(id) => void sessions.select(id)}
      onNewChat={onNewSession}
      onRenameSession={(id, nextTitle) => void sessions.rename(id, nextTitle)}
      onDeleteSession={(id) => void sessions.remove(id)}
      onClose={onClose}
    />
  );
}
```

In `QJudgeCopilotComposer`, replace the session portion of `disabled` with:

```ts
const sessionAcceptsInput =
  sessions.activeSession.status === "ready" ||
  sessions.activeSession.status === "empty";
const disabled =
  !sessionAcceptsInput || isAwaitingHumanInput || composer.isSending;
```

In `SideMenu.tsx`, destructure `startNew: startNewSession` instead of `create`, and replace `handleNewChat` with:

```tsx
const handleNewChat = useCallback(() => {
  startNewSession();
  onClose?.();
  navigate("/chat");
}, [navigate, onClose, startNewSession]);
```

- [ ] **Step 6: Run QJudge integration tests**

Run:

```bash
cd frontend
npm test -- --run src/features/chatbot/contexts/QJudgeCopilotProvider.test.tsx src/features/chatbot/components/chat-ui/QJudgeChatPanel.test.tsx src/features/app/components/SideMenu.test.tsx
npm run check:copilot-dogfood
```

Expected: all tests pass and the boundary reports `Copilot dogfood boundary passed`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/shared/copilot/ui/CopilotPanel.tsx frontend/src/features/chatbot/contexts/QJudgeCopilotProvider.tsx frontend/src/features/chatbot/contexts/QJudgeCopilotProvider.test.tsx frontend/src/features/chatbot/components/chat-ui/QJudgeCopilotSlotComponents.tsx frontend/src/features/chatbot/components/chat-ui/QJudgeChatPanel.test.tsx frontend/src/features/app/components/SideMenu.tsx frontend/src/features/app/components/SideMenu.test.tsx
git commit -m "refactor(chatbot): defer new sessions until send"
```

### Task 5: Render skeletons before empty-state UI

**Files:**
- Modify: `frontend/src/shared/copilot/ui/CopilotPanel.tsx`
- Modify: `frontend/src/shared/copilot/ui/CopilotUI.test.tsx`
- Modify: `frontend/src/features/chatbot/components/chat-ui/MessageList.tsx`
- Modify: `frontend/src/features/chatbot/components/chat-ui/MessageList.test.tsx`
- Modify: `frontend/src/features/chatbot/components/chat-ui/QJudgeCopilotSlotComponents.tsx`
- Modify: `frontend/src/features/chatbot/components/chat-ui/ChatTopBar.tsx`
- Modify: `frontend/src/features/chatbot/components/chat-ui/QJudgeChatPanel.test.tsx`

**Interfaces:**
- Consumes: Task 1 `initializing` state.
- Produces: loading-first panel render order and QJudge title/message skeletons.

- [ ] **Step 1: Extend the message-list loading test**

Replace the loading test in `MessageList.test.tsx` with:

```tsx
it.each(["initializing", "loading"] as const)(
  "shows history skeleton while the session is %s",
  (status) => {
    const activeSession =
      status === "initializing"
        ? { status, id: null, data: null, error: null }
        : { status, id: "session-1", data: null, error: null };
    const { container } = render(
      <MessageList
        {...readyProps}
        messages={[]}
        activeSession={activeSession}
      />,
    );

    expect(
      container.querySelector('[class*="skeletonStack"]'),
    ).toBeInTheDocument();
  },
);
```

- [ ] **Step 2: Add a panel precedence test**

Add to `CopilotUI.test.tsx`:

```tsx
it("renders the loading list before the empty state during bootstrap", async () => {
  const transport = new MemoryCopilotTransport();
  const pendingList = deferred<CopilotSessionSummary[]>();
  vi.spyOn(transport, "listSessions").mockReturnValueOnce(pendingList.promise);
  const Empty = vi.fn(() => <div data-testid="empty-slot">Empty</div>);
  const List = vi.fn(({ activeSession }: CopilotMessageListSlotProps) => (
    <div data-testid="list-slot">{activeSession.status}</div>
  ));

  render(
    <CopilotProvider transport={transport} initialSession="first">
      <CopilotPanel slots={{ emptyState: Empty, messageList: List }} />
    </CopilotProvider>,
  );

  expect(screen.getByTestId("list-slot")).toHaveTextContent("initializing");
  expect(screen.queryByTestId("empty-slot")).not.toBeInTheDocument();

  await act(async () => {
    pendingList.resolve([]);
    await pendingList.promise;
  });

  expect(await screen.findByTestId("empty-slot")).toBeInTheDocument();
});
```

Replace the core type import at the top of `CopilotUI.test.tsx` with:

```ts
import type {
  CopilotMessage,
  CopilotRun,
  CopilotSessionSummary,
} from "@/core/copilot";
```

Add `CopilotMessageListSlotProps` to the existing import from `./copilotUI.types`:

```ts
import type {
  CopilotErrorStateProps,
  CopilotMessageListSlotProps,
  CopilotSuggestionsProps,
} from "./copilotUI.types";
```

- [ ] **Step 3: Add a QJudge title-skeleton test**

Add to `QJudgeChatPanel.test.tsx`:

```tsx
it("shows message and title skeletons while session bootstrap is pending", async () => {
  const transport = new MemoryCopilotTransport();
  const pendingList = deferred<Awaited<ReturnType<typeof transport.listSessions>>>();
  vi.spyOn(transport, "listSessions").mockReturnValueOnce(pendingList.promise);
  const { container } = renderPanel(
    transport,
    null,
    <QJudgeChatPanel mode="sidebar" />,
  );

  expect(screen.getByTestId("chat-title-skeleton")).toBeInTheDocument();
  expect(
    container.querySelector('[class*="skeletonStack"]'),
  ).toBeInTheDocument();
  expect(screen.queryByText(/welcome|歡迎/i)).not.toBeInTheDocument();

  await act(async () => {
    pendingList.resolve([]);
    await pendingList.promise;
  });
  await waitFor(() =>
    expect(screen.queryByTestId("chat-title-skeleton")).not.toBeInTheDocument(),
  );
});
```

- [ ] **Step 4: Run UI tests and verify red**

Run:

```bash
cd frontend
npm test -- --run src/shared/copilot/ui/CopilotUI.test.tsx src/features/chatbot/components/chat-ui/MessageList.test.tsx src/features/chatbot/components/chat-ui/QJudgeChatPanel.test.tsx
```

Expected: the initializing message list and title skeleton assertions fail.

- [ ] **Step 5: Implement loading-first rendering**

In `CopilotPanel.tsx`, derive:

```ts
const sessionIsLoading =
  sessions.activeSession.status === "initializing" ||
  sessions.activeSession.status === "loading";
```

Change the conversation branch so loading precedes errors and empty state:

```tsx
{sessionIsLoading ? (
  <MessageList
    messages={messages}
    activeSessionId={copilot.activeSession.id}
    activeSession={copilot.activeSession}
    run={run.state}
    messageComponent={Message}
  />
) : sessions.activeSession.status === "error" && ErrorState ? (
  <ErrorState
    error={sessions.activeSession.error}
    onRetry={() => {
      const id = sessions.activeSession.id;
      if (id) void sessions.select(id);
      else void sessions.refresh();
    }}
  />
) : sessions.error &&
  sessions.activeSession.status === "empty" &&
  ErrorState ? (
  <ErrorState
    error={sessions.error}
    onRetry={() => void sessions.refresh()}
  />
) : messages.length === 0 && Empty ? (
  <Empty onNewSession={sessions.startNew} />
) : (
  <MessageList
    messages={messages}
    activeSessionId={copilot.activeSession.id}
    activeSession={copilot.activeSession}
    run={run.state}
    messageComponent={Message}
  />
)}
```

In `MessageList.tsx`, change:

```ts
const isLoading =
  activeSession.status === "initializing" ||
  activeSession.status === "loading";
```

In `ChatTopBar.tsx`, import `SkeletonText`, add `loading?: boolean` to both prop variants, destructure it in full mode, and use this title content:

```tsx
const titleSlot = loading ? (
  <div className={styles.titleArea} data-testid="chat-title-skeleton">
    <SkeletonText width="10rem" />
  </div>
) : (
  <div className={styles.titleArea} ref={dropdownRef}>
    {renamingId === currentSessionId ? (
      <input
        className={styles.renameInput}
        value={renameValue}
        onChange={(event) => setRenameValue(event.target.value)}
        onBlur={commitRename}
        onKeyDown={(event) => {
          if (event.key === "Enter") commitRename();
          if (event.key === "Escape") {
            setRenamingId(null);
            setRenameValue("");
          }
        }}
        autoFocus
      />
    ) : (
      <button
        type="button"
        className={styles.titleBtn}
        onClick={() => setDropdownOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={dropdownOpen}
      >
        <span className={styles.titleText}>{displayTitle}</span>
        <ChevronDown
          size={16}
          className={`${styles.titleChevron} ${dropdownOpen ? styles.open : ""}`}
        />
      </button>
    )}
    {dropdownOpen && (
      <div className={styles.dropdown} role="listbox">
        {sessions.slice(0, 15).map((session) => (
          <button
            key={session.id}
            type="button"
            role="option"
            aria-selected={session.id === currentSessionId}
            className={`${styles.dropdownItem} ${
              session.id === currentSessionId ? styles.dropdownItemActive : ""
            }`}
            onClick={() => {
              onSelectSession(session.id);
              setDropdownOpen(false);
            }}
          >
            <ChatIcon size={14} className={styles.dropdownItemIcon} />
            <span className={styles.dropdownItemTitle}>
              {session.title || t("ui.newChat")}
            </span>
            <span className={styles.dropdownItemTime}>
              {formatRelativeTime(session.updatedAt)}
            </span>
          </button>
        ))}
      </div>
    )}
  </div>
);
```

In `QJudgeCopilotHeader`, pass:

```tsx
loading={
  activeSession.status === "initializing" ||
  activeSession.status === "loading"
}
```

In the full-page `ChatTopBar` actions, guard the session overflow menu so rename/delete controls are absent while the title is loading:

```tsx
{!loading && currentSessionId && (
  <OverflowMenu
    flipped
    size="md"
    align="bottom"
    iconDescription={t("ui.moreOptions")}
  >
    <OverflowMenuItem
      itemText={t("ui.rename")}
      onClick={() => {
        const session = sessions.find(
          (item) => item.id === currentSessionId,
        );
        if (session) startRename(session);
      }}
    />
    <OverflowMenuItem
      itemText={t("ui.delete")}
      isDelete
      hasDivider
      onClick={() => onDeleteSession(currentSessionId)}
    />
  </OverflowMenu>
)}
```

- [ ] **Step 6: Run UI tests**

Run:

```bash
cd frontend
npm test -- --run src/shared/copilot/ui/CopilotUI.test.tsx src/features/chatbot/components/chat-ui/MessageList.test.tsx src/features/chatbot/components/chat-ui/QJudgeChatPanel.test.tsx
npm run typecheck:copilot
```

Expected: all tests pass and the first render is a skeleton.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/shared/copilot/ui/CopilotPanel.tsx frontend/src/shared/copilot/ui/CopilotUI.test.tsx frontend/src/features/chatbot/components/chat-ui/MessageList.tsx frontend/src/features/chatbot/components/chat-ui/MessageList.test.tsx frontend/src/features/chatbot/components/chat-ui/QJudgeCopilotSlotComponents.tsx frontend/src/features/chatbot/components/chat-ui/ChatTopBar.tsx frontend/src/features/chatbot/components/chat-ui/QJudgeChatPanel.test.tsx
git commit -m "fix(chatbot): show skeleton during session bootstrap"
```

### Task 6: Contain embedded chat width and localize wide Markdown overflow

**Files:**
- Modify: `frontend/src/shared/copilot/ui/copilot.css`
- Modify: `frontend/src/shared/copilot/ui/CopilotShells.test.tsx`
- Modify: `frontend/src/features/chatbot/components/chat-ui/ChatContainer.module.scss`
- Modify: `frontend/src/features/chatbot/components/chat-ui/MessageList.module.scss`
- Modify: `frontend/src/features/chatbot/components/chat-ui/MessageBubble.module.scss`
- Modify: `frontend/src/features/chatbot/components/chat-ui/ComposerBar.module.scss`
- Modify: `frontend/src/features/chatbot/components/chat-ui/QJudgeChatPanel.test.tsx`
- Modify: `frontend/src/features/chatbot/components/chat-ui/__stories__/MessageBubble.stories.tsx`

**Interfaces:**
- Consumes: existing shell classes and QJudge CSS-module class chain.
- Produces: no shell-level horizontal overflow; local scroll for intrinsically wide Markdown.

- [ ] **Step 1: Add failing shared shell CSS assertions**

Add this helper and test to `CopilotShells.test.tsx`:

```tsx
function cssRule(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

it("contains embed width at every shared shell boundary", () => {
  const root = cssRule(copilotStyles, ".copilot-root");
  const embed = cssRule(copilotStyles, ".copilot-embed");
  const body = cssRule(copilotStyles, ".copilot-panel-body");
  const conversation = cssRule(copilotStyles, ".copilot-conversation");

  expect(root).toContain("min-width: 0");
  expect(root).toContain("max-width: 100%");
  expect(embed).toContain("width: 100%");
  expect(embed).toContain("overflow: hidden");
  expect(body).toContain("min-width: 0");
  expect(body).toContain("overflow: hidden");
  expect(conversation).toContain("min-width: 0");
  expect(conversation).toContain("overflow: hidden");
});
```

- [ ] **Step 2: Add failing QJudge CSS assertions**

At the top of `QJudgeChatPanel.test.tsx`, import `readFileSync` and define:

```ts
const chatContainerStyles = readFileSync(
  "src/features/chatbot/components/chat-ui/ChatContainer.module.scss",
  "utf8",
);
const messageListStyles = readFileSync(
  "src/features/chatbot/components/chat-ui/MessageList.module.scss",
  "utf8",
);
const messageBubbleStyles = readFileSync(
  "src/features/chatbot/components/chat-ui/MessageBubble.module.scss",
  "utf8",
);
const composerStyles = readFileSync(
  "src/features/chatbot/components/chat-ui/ComposerBar.module.scss",
  "utf8",
);

function scssRule(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}
```

Add this test:

```tsx
it("keeps padded chat content inside an embedded panel", () => {
  const container = scssRule(chatContainerStyles, ".container");
  const chatOnlyRow = scssRule(chatContainerStyles, ".chatOnlyRow");
  const wrapper = scssRule(messageListStyles, ".wrapper");
  const composer = scssRule(composerStyles, ".bar");

  expect(container).toContain("min-width: 0");
  expect(container).toContain("max-width: 100%");
  expect(chatOnlyRow).toContain("min-width: 0");
  expect(chatOnlyRow).toContain("overflow: hidden");
  expect(wrapper).toContain("min-width: 0");
  expect(wrapper).toContain("max-width: 100%");
  expect(messageListStyles).toContain("box-sizing: border-box");
  expect(messageBubbleStyles).toContain("overflow-wrap: anywhere");
  expect(messageBubbleStyles).toContain("overflow-x: auto");
  expect(composer).toContain("min-width: 0");
  expect(composer).toContain("box-sizing: border-box");
});
```

- [ ] **Step 3: Run CSS contract tests and verify red**

Run:

```bash
cd frontend
npm test -- --run src/shared/copilot/ui/CopilotShells.test.tsx src/features/chatbot/components/chat-ui/QJudgeChatPanel.test.tsx
```

Expected: width-chain and border-box assertions fail.

- [ ] **Step 4: Implement the shared shell width chain**

Replace `copilot.css` with this complete file:

```css
:root {
  --copilot-color-background: #ffffff;
  --copilot-color-surface: #f4f4f4;
  --copilot-color-text: #161616;
  --copilot-color-accent: #0f62fe;
  --copilot-space-1: 0.25rem;
  --copilot-space-2: 0.5rem;
  --copilot-space-3: 1rem;
  --copilot-radius-1: 0.5rem;
  --copilot-font-family: system-ui, sans-serif;
  --copilot-panel-width: 24rem;
  --copilot-composer-max-height: 12rem;
}

.copilot-root {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 0;
  color: var(--copilot-color-text);
  background: var(--copilot-color-background);
  font-family: var(--copilot-font-family);
}

.copilot-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--copilot-space-2);
  padding: var(--copilot-space-3);
}

.copilot-header h2 {
  margin: 0;
  font-size: 1rem;
}

.copilot-messages {
  box-sizing: border-box;
  flex: 1;
  min-width: 0;
  max-width: 100%;
  margin: 0;
  padding: var(--copilot-space-3);
  overflow: auto;
  list-style: none;
}

.copilot-message {
  max-width: 100%;
  padding: var(--copilot-space-2);
  border-radius: var(--copilot-radius-1);
}

.copilot-message[data-role="user"] {
  background: var(--copilot-color-surface);
}

.copilot-composer {
  display: flex;
  gap: var(--copilot-space-2);
  max-width: 100%;
  padding: var(--copilot-space-3);
}

.copilot-composer label {
  flex: 1;
  min-width: 0;
}

.copilot-composer textarea {
  box-sizing: border-box;
  width: 100%;
  max-height: var(--copilot-composer-max-height);
  resize: vertical;
}

.copilot-history ol {
  margin: 0;
  padding: var(--copilot-space-2);
  list-style: none;
}

.copilot-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.copilot-panel-content,
.copilot-conversation {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  max-width: 100%;
  height: 100%;
  overflow: hidden;
}

.copilot-panel-content {
  width: 100%;
}

.copilot-panel-body {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  max-width: 100%;
  overflow: hidden;
}

.copilot-conversation {
  flex: 1;
}

.copilot-workspace {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 0;
}

.copilot-workspace[data-side="left"] {
  flex-direction: row-reverse;
}

.copilot-workspace-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.copilot-workspace-panel {
  width: min(var(--copilot-panel-width), 100%);
  max-width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.copilot-workspace-toggle {
  position: absolute;
  inset-block-end: var(--copilot-space-3);
  inset-inline-end: var(--copilot-space-3);
}

.copilot-full-page {
  width: 100%;
  max-width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.copilot-embed {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  container-type: inline-size;
}
```

- [ ] **Step 5: Implement QJudge containment and local Markdown scrolling**

Add to `.container` in `ChatContainer.module.scss`:

```scss
width: 100%;
max-width: 100%;
min-width: 0;
```

Add to `.chatOnlyRow`:

```scss
min-width: 0;
max-width: 100%;
overflow: hidden;
```

Update `MessageList.module.scss`:

```scss
.wrapper {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.list {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;

  > * {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    max-width: $chat-content-max-width;
    margin-left: auto;
    margin-right: auto;
  }
}

.skeletonStack,
.skeletonMessage,
.skeletonContent {
  box-sizing: border-box;
  min-width: 0;
  max-width: 100%;
}
```

Merge these declarations into the existing selectors rather than creating duplicate blocks.

Update `MessageBubble.module.scss`:

```scss
.bubble {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 100%;
}

.markdown {
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  overflow-wrap: anywhere;

  :global(pre),
  :global(table),
  :global(.code-block-wrapper),
  :global(.katex-display) {
    max-width: 100%;
  }

  :global(p code),
  :global(li code) {
    white-space: normal;
    overflow-wrap: anywhere;
  }

  :global(img),
  :global(svg),
  :global(video) {
    max-width: 100%;
    height: auto;
  }
}
```

Add to `.bar` and `.inputWrapper` in `ComposerBar.module.scss`:

```scss
box-sizing: border-box;
min-width: 0;
max-width: 100%;
```

- [ ] **Step 6: Add a reproducible narrow overflow story**

Add to `MessageBubble.stories.tsx`:

```tsx
export const NarrowOverflowStress: Story = {
  name: "AI — 窄面板 overflow stress",
  decorators: [
    (StoryComponent) => (
      <div style={{ width: 320, maxWidth: "100%", overflow: "hidden" }}>
        <StoryComponent />
      </div>
    ),
  ],
  args: {
    message: {
      id: "overflow-stress",
      role: "assistant",
      createdAt: new Date("2026-07-21T00:00:00.000Z"),
      parts: [
        {
          type: "text",
          text: [
            "https://example.com/this-is-a-very-long-unbroken-path-that-must-not-expand-the-chat-panel-beyond-its-container",
            "",
            "| very long heading | another very long heading |",
            "| --- | --- |",
            "| long-table-cell-without-spaces-abcdefghijklmnopqrstuvwxyz | another-long-cell-abcdefghijklmnopqrstuvwxyz |",
            "",
            "```text",
            "const_really_long_identifier_without_breaks_abcdefghijklmnopqrstuvwxyz_abcdefghijklmnopqrstuvwxyz = true;",
            "```",
          ].join("\n"),
        },
      ],
    },
  },
};
```

- [ ] **Step 7: Run style tests and build Storybook**

Run:

```bash
cd frontend
npm test -- --run src/shared/copilot/ui/CopilotShells.test.tsx src/features/chatbot/components/chat-ui/QJudgeChatPanel.test.tsx
npm run build-storybook
```

Expected: tests pass and Storybook builds without Sass errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/shared/copilot/ui/copilot.css frontend/src/shared/copilot/ui/CopilotShells.test.tsx frontend/src/features/chatbot/components/chat-ui/ChatContainer.module.scss frontend/src/features/chatbot/components/chat-ui/MessageList.module.scss frontend/src/features/chatbot/components/chat-ui/MessageBubble.module.scss frontend/src/features/chatbot/components/chat-ui/ComposerBar.module.scss frontend/src/features/chatbot/components/chat-ui/QJudgeChatPanel.test.tsx frontend/src/features/chatbot/components/chat-ui/__stories__/MessageBubble.stories.tsx
bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh
git commit -m "fix(chatbot): contain embedded chat width"
```

### Task 7: Remove confirmed legacy leftovers without changing backend contracts

**Files:**
- Delete: `frontend/src/features/chatbot/hooks/useChatScrollToBottom.ts`
- Modify: `frontend/src/features/chatbot/contexts/ArtifactPanelContext.tsx`
- Modify: `frontend/src/features/chatbot/components/chat-ui/ChatContainer.module.scss`
- Modify: `frontend/src/infrastructure/copilot/qJudgeCopilotTransport.ts`
- Modify: `frontend/src/features/chatbot/components/chat-ui/QJudgeChatPanel.test.tsx`

**Interfaces:**
- Consumes: existing `useCopilotScroll`, `ArtifactPanelProvider` without callers passing `sessionId`.
- Produces: no compatibility alias/deprecated prop/dead selector; repository conversion seam remains under infrastructure.

- [ ] **Step 1: Add a failing legacy-cleanliness assertion**

Import `existsSync` alongside `readFileSync` in `QJudgeChatPanel.test.tsx`, then define:

```ts
const artifactContextSource = readFileSync(
  "src/features/chatbot/contexts/ArtifactPanelContext.tsx",
  "utf8",
);
const qJudgeTransportSource = readFileSync(
  "src/infrastructure/copilot/qJudgeCopilotTransport.ts",
  "utf8",
);
```

Add this test:

```tsx
it("contains no retired feature compatibility leftovers", () => {
  expect(
    existsSync("src/features/chatbot/hooks/useChatScrollToBottom.ts"),
  ).toBe(false);
  expect(artifactContextSource).not.toContain("@deprecated");
  expect(artifactContextSource).not.toContain("sessionId?:");
  for (const selector of [
    ".splitRow",
    ".chatBody",
    ".messagesArea",
    ".composerFloat",
    ".loading",
  ]) {
    expect(chatContainerStyles).not.toContain(selector);
  }
  expect(qJudgeTransportSource).not.toContain("legacyRuns");
});
```

- [ ] **Step 2: Run the test and verify red**

Run:

```bash
cd frontend
npm test -- --run src/features/chatbot/components/chat-ui/QJudgeChatPanel.test.tsx
```

Expected: the alias file, deprecated prop, dead selectors, and `legacyRuns` assertions fail.

- [ ] **Step 3: Remove only the confirmed leftovers**

Delete `frontend/src/features/chatbot/hooks/useChatScrollToBottom.ts`.

Replace the Artifact provider prop interface with:

```ts
interface ArtifactPanelProviderProps {
  children: ReactNode;
}
```

Delete these complete selector blocks from `ChatContainer.module.scss`:

```scss
.splitRow {
  flex: 1;
  min-height: 0;
  display: flex;
}

.chatBody {
  flex: 1;
  height: 100%;
  min-height: 0;
  min-width: 0;
  position: relative;
}

.messagesArea {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
}

.composerFloat {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 2;
  pointer-events: none;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  width: 100%;
}
```

Replace the four map references in `qJudgeCopilotTransport.ts` exactly as follows:

```ts
const repositoryRuns = new Map<string, ChatRun>();
repositoryRuns.set(run.id, run);
...(repositoryRuns.get(run.id) ?? mapCopilotRunToChat(run)),
repositoryRuns.set(run.id, legacyRun);
```

Do not delete or relocate `ChatbotRepository`, `ChatMessage`, `ChatSession`, `ChatRun`, `chatbotCopilotMapper.ts`, or the API repository. They are the QJudge backend conversion boundary, not a second runtime.

- [ ] **Step 4: Run legacy scans and boundary tests**

Run:

```bash
cd frontend
npm test -- --run src/features/chatbot/components/chat-ui/QJudgeChatPanel.test.tsx src/features/chatbot/contexts/ArtifactPanelContext.test.tsx src/infrastructure/copilot/qJudgeCopilotTransport.test.ts
npm run check:copilot-boundary
npm run check:copilot-dogfood
! rg -n "useLegacyChatbotRuntime|useChatbotContext|useOptionalChatbotContext|useChatSessionContext|ChatbotProvider|useChatScrollToBottom|legacyRuns" src --glob '!**/*.test.*' --glob '!**/*.stories.*'
```

Expected: tests and both boundary scripts pass; `rg` returns no production matches.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/chatbot/hooks/useChatScrollToBottom.ts frontend/src/features/chatbot/contexts/ArtifactPanelContext.tsx frontend/src/features/chatbot/components/chat-ui/ChatContainer.module.scss frontend/src/infrastructure/copilot/qJudgeCopilotTransport.ts frontend/src/features/chatbot/components/chat-ui/QJudgeChatPanel.test.tsx
git commit -m "chore(chatbot): remove retired compatibility leftovers"
```

### Task 8: Run complete gates and local browser verification

**Files:**
- Verify only; modify a source/test file only if a gate exposes a regression, then rerun that task's red/green cycle.

**Interfaces:**
- Consumes: Tasks 1–7.
- Produces: evidence that full page, embed, lazy session, skeleton, streaming, and boundaries are ready to merge.

- [ ] **Step 1: Run the Copilot gates serially**

Run:

```bash
cd frontend
npm run test:copilot
npm run typecheck:copilot
npm run check:copilot-boundary
npm run check:copilot-dogfood
npm run build:copilot-example
```

Expected: every command exits 0.

- [ ] **Step 2: Run frontend architecture, naming, lint, and production build**

Run from the repository root:

```bash
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-naming.js --root frontend/src
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-architecture.js --root frontend/src --policy compat
cd frontend
npm run lint
npm run build
```

Expected: architecture passes, naming adds no new violation, ESLint has no errors, and the Vite production build exits 0.

- [ ] **Step 3: Run the full frontend suite serially**

Run:

```bash
cd frontend
npm test -- --maxWorkers=1
```

Expected: all frontend test files pass; existing intentional skips remain the only skips.

- [ ] **Step 4: Verify lazy session creation in the local QJudge browser**

Open the local QJudge site with an existing `ai_session_id`, open the embedded workspace chat, and perform these exact checks:

1. Record the current session list count from the history UI.
2. Press the embedded `+` button.
3. Confirm the URL no longer contains `ai_session_id` and the session list count has not increased.
4. Enter `你好` and press send.
5. Confirm exactly one new session appears, the URL receives its ID, and assistant text streams incrementally.
6. Press `+` again and leave the page without sending; return to history and confirm no additional empty session exists.

Expected: only Step 4's first valid send creates a session.

- [ ] **Step 5: Verify refresh skeleton and width containment**

Throttle the browser network to Slow 3G, refresh both full-page chat and an embedded chat with a valid session, and confirm the title/message skeleton appears before content without a welcome/new-chat flash.

In DevTools Console on the embedded panel run:

```js
const embed = document.querySelector('[data-testid="copilot-embed"]');
const conversation = embed?.querySelector('.copilot-conversation');
({
  embedFits: !!embed && embed.scrollWidth <= embed.clientWidth,
  conversationFits:
    !!conversation && conversation.scrollWidth <= conversation.clientWidth,
});
```

Expected:

```js
{ embedFits: true, conversationFits: true }
```

Send or render the overflow-stress Markdown from the Storybook story, resize the embedded panel to 320px, 400px, and 700px, and confirm long text/media fits while code/table overflow stays inside the message content. Repeat on the mobile bottom sheet and verify the composer remains visible with one vertical message scrollbar.

- [ ] **Step 6: Inspect the final diff and status**

Run:

```bash
git diff dev...HEAD --check
git diff dev...HEAD --stat
git status --short --branch
```

Expected: diff check is clean; only intended frontend/spec/plan files differ; the two protected untracked `ai-service/.deepagents` files remain untracked and untouched.
