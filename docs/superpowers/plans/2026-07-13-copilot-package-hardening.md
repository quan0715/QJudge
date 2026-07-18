# Copilot Package Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不立即建立 npm package 的前提下，把現有 QJudge chatbot 收斂成可測試、可替換 transport、具三種預設 UI shell 的 Copilot package candidate。

**Architecture:** 純 Copilot domain、events、reducer 與 ports 放在 `frontend/src/core/copilot`；React runtime、hooks、testing adapters 與無 Carbon UI 放在 `frontend/src/shared/copilot`；QJudge REST/SSE、browser storage 與 Router/i18n adapters 放在 `frontend/src/infrastructure/copilot` 與 `frontend/src/features/chatbot/adapters`。既有 `useChatbot` 與 `ChatbotProvider` 保留為相容 facade，逐步改接 Copilot runtime。

**Tech Stack:** React 19、TypeScript 5.9、Vitest 4、Testing Library、Vite 7、Storybook 9、Sass modules。

## Global Constraints

- 本計畫不建立 workspace package、不發布 npm、不變更 backend API。
- Public candidate exports 使用 `Copilot` vocabulary；既有 `Chat*`／`useChatbot*` 只作相容層。
- `core/copilot` 不得 import React、DOM、Router、i18n、Carbon 或 `@/infrastructure`。
- `shared/copilot` 只得 import React、`@/core/copilot` 與自身檔案；不得 import QJudge feature 或 infrastructure。
- 所有外部 I/O 只能經由 Copilot ports。
- 預設 UI 不依賴 Carbon，不使用 `.cds-*`、`.bx-*` 或 `!important`。
- 每個 task 先建立失敗測試，再加入最小實作。
- Characterization tests 是例外：它們先記錄現有行為，第一次完整執行預期應通過；若失敗，先記錄現況差異，不以修改 production code 迎合測試。
- 每個 gate 完成後執行 naming、architecture、TypeScript 與相關 Vitest。
- 設計依據：`docs/superpowers/specs/2026-07-13-copilot-package-design.md`。

---

## File Map

### Pure core

- `frontend/src/core/copilot/copilot.types.ts`：session、message parts、run、state 與 error types。
- `frontend/src/core/copilot/copilotEvent.types.ts`：transport-normalized run events。
- `frontend/src/core/copilot/copilotReducer.ts`：純 state transition 與 stream merge。
- `frontend/src/core/copilot/copilotSelectors.ts`：session/run/message 衍生資料。
- `frontend/src/core/copilot/ports/copilotTransport.ts`：後端 I/O contract。
- `frontend/src/core/copilot/ports/copilotSessionLocation.ts`：全域 session ID contract。
- `frontend/src/core/copilot/ports/copilotStorage.ts`：偏好儲存 contract。
- `frontend/src/core/copilot/ports/copilotTranslations.ts`：UI 文案 contract。
- `frontend/src/core/copilot/index.ts`：唯一 core public candidate entrypoint。
- `frontend/type-tests/copilot.types.typecheck.ts`：discriminated unions compile-time assertions。
- `frontend/type-tests/copilot.public-api.typecheck.ts`：public type/value exports compile-time assertions。
- `frontend/tsconfig.copilot-type-tests.json`：不受 app test exclude 影響的獨立 typecheck project。

### React runtime and testing

- `frontend/src/shared/copilot/react/CopilotProvider.tsx`：composition 與 lifecycle owner。
- `frontend/src/shared/copilot/react/copilotContexts.ts`：細粒度 contexts。
- `frontend/src/shared/copilot/hooks/useCopilot.ts`：便利 facade。
- `frontend/src/shared/copilot/hooks/useCopilotSessions.ts`：session commands/state。
- `frontend/src/shared/copilot/hooks/useCopilotRun.ts`：run/HITL commands/state。
- `frontend/src/shared/copilot/hooks/useCopilotComposer.ts`：draft/model/attachment/send。
- `frontend/src/shared/copilot/hooks/useCopilotSessionLocation.ts`：location state。
- `frontend/src/shared/copilot/hooks/useCopilotScroll.ts`：scroll behavior。
- `frontend/src/shared/copilot/testing/MemoryCopilotTransport.ts`：deterministic fake transport。
- `frontend/src/shared/copilot/testing/MemoryCopilotSessionLocation.ts`：location fake。
- `frontend/src/shared/copilot/testing/MemoryCopilotStorage.ts`：storage fake。
- `frontend/src/shared/copilot/translations/DefaultCopilotTranslations.ts`：package 預設英文文案。
- `frontend/src/shared/copilot/index.ts`：React/UI public candidate entrypoint。

### QJudge adapters and compatibility

- `frontend/src/infrastructure/copilot/QJudgeCopilotTransport.ts`：現有 repository → transport。
- `frontend/src/infrastructure/copilot/BrowserCopilotStorage.ts`：localStorage adapter。
- `frontend/src/infrastructure/copilot/BrowserCopilotSessionLocation.ts`：原生 URLSearchParams/History adapter。
- `frontend/src/features/chatbot/adapters/ReactRouterCopilotSessionLocation.ts`：search params adapter。
- `frontend/src/features/chatbot/adapters/QJudgeCopilotTranslations.ts`：i18next adapter。
- `frontend/src/features/chatbot/contexts/ChatbotProvider.tsx`：QJudge composition root／compatibility context。
- `frontend/src/features/chatbot/hooks/useChatbot.ts`：compatibility facade。

### UI

- `frontend/src/shared/copilot/ui/CopilotMessageView.tsx`
- `frontend/src/shared/copilot/ui/CopilotHeader.tsx`
- `frontend/src/shared/copilot/ui/CopilotMessageList.tsx`
- `frontend/src/shared/copilot/ui/CopilotComposer.tsx`
- `frontend/src/shared/copilot/ui/CopilotHistoryPanel.tsx`
- `frontend/src/shared/copilot/ui/CopilotApprovalCard.tsx`
- `frontend/src/shared/copilot/ui/CopilotQuestionCard.tsx`
- `frontend/src/shared/copilot/ui/CopilotScrollToLatestButton.tsx`
- `frontend/src/shared/copilot/ui/CopilotWorkspaceShell.tsx`
- `frontend/src/shared/copilot/ui/CopilotFullPageShell.tsx`
- `frontend/src/shared/copilot/ui/CopilotEmbedShell.tsx`
- `frontend/src/shared/copilot/ui/copilot.css`：CSS variables 與預設 layout。

---

### Task 1: Freeze legacy session behavior

**Files:**
- Create: `frontend/src/features/chatbot/hooks/useChatbotSessionLifecycle.test.ts`
- Modify: `frontend/src/features/chatbot/hooks/useChatbot.test.ts`

**Interfaces:**
- Consumes: existing `useChatbot(options)` and mocked `chatbotRepository`.
- Produces: regression coverage for initialization, selection, create, rename, delete and request races.

- [ ] **Step 1: Add repository fixture and wrapper helpers**

Create typed fixtures in the test file: `makeMessage(id, role, content)`, `makeSession(id, messages)`, `makeRun(overrides)`, `deferred<T>()`, and a `repository` object whose methods are `vi.fn()` implementations of `ChatbotRepository`.

- [ ] **Step 2: Write complete initialization characterization tests**

Start with these complete cases; `makeSession()` returns the existing `ChatSession` shape and the hoisted repository mock implements every `ChatbotRepository` method with `vi.fn()`:

```ts
it("does not request sessions when disabled", async () => {
  const { result } = renderHook(() => useChatbot({ enabled: false }));

  await waitFor(() => expect(result.current.isInitializing).toBe(false));
  expect(repository.getSessions).not.toHaveBeenCalled();
  expect(repository.getActiveRuns).not.toHaveBeenCalled();
});

it("uses the initial session hint before local storage", async () => {
  const first = makeSession("session-1", []);
  const hinted = makeSession("session-2", []);
  vi.mocked(localStorage.getItem).mockReturnValue("session-1");
  repository.getSessions.mockResolvedValue([first, hinted]);
  repository.getActiveRuns.mockResolvedValue([]);
  repository.getModels.mockResolvedValue([]);
  repository.getSession.mockResolvedValue({
    ...hinted,
    messages: [makeMessage("message-1", "assistant", "ready")],
  });

  const { result } = renderHook(() =>
    useChatbot({ enabled: true, initialSessionIdHint: "session-2" }),
  );

  await waitFor(() => expect(result.current.currentSessionId).toBe("session-2"));
  expect(repository.getSession).toHaveBeenCalledWith("session-2");
});
```

Add `loads the selected session detail in the background` and `creates a session when the backend list is empty` with the same fixture style. Assert repository calls and the final `currentSessionId`, `isInitializing`, `sessions`, and `isSessionLoading` values.

- [ ] **Step 3: Run the characterization suite against current production code**

Run: `cd frontend && npm test -- --run src/features/chatbot/hooks/useChatbotSessionLifecycle.test.ts`

Expected: PASS. A failure means the fixture assumption differs from current behavior; correct the test description or fixture and record the observed behavior before changing production code.

- [ ] **Step 4: Complete the test harness without changing production behavior**

Use `renderHook`, `act`, `waitFor`, reset localStorage mocks in `beforeEach`, and resolve deferred promises inside `act`. Do not modify `useChatbot.ts` in this task.

- [ ] **Step 5: Add session mutation and race cases**

For `does not replace the latest selection when an older detail request resolves`, use two `deferred<ChatSession>()` values: select session A, immediately select B, resolve B first and A last, then assert `currentSessionId === "session-b"` and `currentSession?.id === "session-b"`. Add the other three cases with explicit assertions: unknown session detail is inserted once, delete calls `getSession(fallbackId)`, and rename updates only the matching local title.

- [ ] **Step 6: Verify the characterization gate**

Run: `cd frontend && npm test -- --run src/features/chatbot/hooks/useChatbot.test.ts src/features/chatbot/hooks/useChatbotSessionLifecycle.test.ts`

Expected: PASS with all legacy merge and session behavior tests.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/chatbot/hooks/useChatbot.test.ts frontend/src/features/chatbot/hooks/useChatbotSessionLifecycle.test.ts
git commit -m "test(chatbot): characterize session lifecycle"
```

### Task 2: Freeze legacy run, HITL and cancellation behavior

**Files:**
- Create: `frontend/src/features/chatbot/hooks/useChatbotRunLifecycle.test.ts`

**Interfaces:**
- Consumes: Task 1 test fixtures and current repository callbacks.
- Produces: regression coverage for run subscription, replay, HITL, question, cancel and unmount.

- [ ] **Step 1: Expose a controllable subscription fixture inside the test**

Implement `subscribeRunEvents` so the test captures `StreamCallbacks` and rejects with an `AbortError` when the supplied signal aborts.

- [ ] **Step 2: Write complete stream lifecycle characterization tests**

```ts
it("keeps the approval card when submit approval fails", async () => {
  const { result, callbacks } = await renderActiveRun();
  act(() => callbacks.onAwaitingApproval?.({ actionRequests: [{ name: "write" }] }));
  repository.submitRunApproval.mockRejectedValue(new Error("offline"));

  await act(async () => result.current.submitApproval("approve"));

  expect(result.current.pendingApproval).toEqual({
    actionRequests: [{ name: "write" }],
  });
  expect(result.current.error).toBeTruthy();
});

it("aborts the current subscription on unmount", async () => {
  let subscriptionSignal: AbortSignal | undefined;
  repository.subscribeRunEvents.mockImplementation(async (_run, _callbacks, options) => {
    subscriptionSignal = options?.signal;
    return new Promise<void>(() => undefined);
  });

  const { unmount } = renderHook(() => useChatbot());
  await waitFor(() => expect(repository.subscribeRunEvents).toHaveBeenCalled());
  unmount();

  expect(subscriptionSignal?.aborted).toBe(true);
});
```

`renderActiveRun()` must return both `result` and the captured callbacks. Add the remaining five cases with assertions for `isStreaming/isLoading`, merged assistant content/tool history, subscription call count, retained question payload and isolation between the old/new AbortControllers.

- [ ] **Step 3: Run the run characterization suite**

Run: `cd frontend && npm test -- --run src/features/chatbot/hooks/useChatbotRunLifecycle.test.ts`

Expected: PASS against current production behavior. If a case fails, reconcile the expected behavior with the existing focused tests and recent chatbot fixes before changing production code.

- [ ] **Step 4: Complete fixtures and assert current behavior**

Assert `isStreaming`, `isLoading`, `pendingApproval`, `pendingQuestion`, assistant `runStatus`, `cancelRun` calls, and subscription call count after `subscribeEpoch` changes.

- [ ] **Step 5: Verify Gate 1**

Run: `cd frontend && npm test -- --run src/features/chatbot/hooks/useChatbot`

Expected: PASS for merge, session lifecycle and run lifecycle suites.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/chatbot/hooks/useChatbotRunLifecycle.test.ts
git commit -m "test(chatbot): characterize run lifecycle"
```

### Task 3: Add Copilot public domain types

**Files:**
- Create: `frontend/src/core/copilot/copilot.types.ts`
- Create: `frontend/src/core/copilot/copilotEvent.types.ts`
- Create: `frontend/src/core/copilot/index.ts`
- Create: `frontend/type-tests/copilot.types.typecheck.ts`
- Create: `frontend/tsconfig.copilot-type-tests.json`
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: the exact `CopilotSession`, `CopilotActiveSessionState`, `CopilotMessagePart`, `CopilotRunState`, `CopilotError`, command and event types approved in the design spec.

- [ ] **Step 1: Add an independent typecheck project**

Create `tsconfig.copilot-type-tests.json`:

```json
{
  "extends": "./tsconfig.app.json",
  "compilerOptions": { "noEmit": true },
  "include": ["type-tests/**/*.typecheck.ts"],
  "exclude": []
}
```

Add `"typecheck:copilot": "tsc -p tsconfig.copilot-type-tests.json"` to `package.json`.

- [ ] **Step 2: Write actual compile-time assertions**

```ts
import type { CopilotActiveSessionState } from "@/core/copilot";

const sessionFixture = {
  id: "session-1",
  title: "Session",
  messages: [],
  createdAt: new Date("2026-07-13T00:00:00.000Z"),
  updatedAt: new Date("2026-07-13T00:00:00.000Z"),
};

const ready: CopilotActiveSessionState = {
  status: "ready",
  id: "session-1",
  data: sessionFixture,
  error: null,
};
void ready;

// @ts-expect-error ready requires a concrete session
const invalidReady: CopilotActiveSessionState = { status: "ready", id: "session-1", data: null, error: null };
void invalidReady;

// @ts-expect-error empty cannot carry a session id
const invalidEmpty: CopilotActiveSessionState = { status: "empty", id: "session-1", data: null, error: null };
void invalidEmpty;
```

- [ ] **Step 3: Verify red through tsc**

Run: `cd frontend && npm run typecheck:copilot`

Expected: FAIL because `@/core/copilot` does not exist.

- [ ] **Step 4: Implement the approved public types**

Copy the complete type contracts from spec sections 8.1–8.6 into `copilot.types.ts`. Put `CopilotRunEvent`, `CopilotRunObserver`, `CopilotSubscription` and subscribe options in `copilotEvent.types.ts`. Re-export only public candidates from `index.ts`.

- [ ] **Step 5: Verify types through the dedicated compiler project**

Run: `cd frontend && npm run typecheck:copilot && npm run build`

Expected: PASS; TypeScript accepts valid states and rejects the annotated invalid states.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/core/copilot frontend/type-tests/copilot.types.typecheck.ts frontend/tsconfig.copilot-type-tests.json frontend/package.json
git commit -m "feat(copilot): define public domain types"
```

### Task 4: Extract the pure event reducer

**Files:**
- Create: `frontend/src/core/copilot/copilotReducer.ts`
- Create: `frontend/src/core/copilot/copilotReducer.test.ts`
- Create: `frontend/src/core/copilot/copilotSelectors.ts`
- Create: `frontend/src/core/copilot/copilotSelectors.test.ts`
- Create: `frontend/src/features/chatbot/lib/chatbotLegacyMerge.ts`
- Modify: `frontend/src/features/chatbot/hooks/useChatbot.ts`

**Interfaces:**
- Consumes: `CopilotRunEvent`, `CopilotSession`, `CopilotRunState`.
- Produces: `createCopilotRuntimeState()`, `reduceCopilotEvent(state, event)`, `selectActiveSession()`, `selectActiveRun()`.

- [ ] **Step 1: Write the reducer and selector matrix**

Reducer tests cover text delta, reasoning delta, tool upsert by `toolCallId`, sequence replay, stale session, stale run, awaiting approval, second approval after resume, awaiting answer, completed, failed and cancelled. Selector tests prove `selectActiveSession()` returns the correct `empty/loading/ready/error` union and `selectActiveRun()` returns only the active session's run.

- [ ] **Step 2: Verify red**

Run: `cd frontend && npm test -- --run src/core/copilot/copilotReducer.test.ts`

Expected: FAIL because reducer exports are missing.

- [ ] **Step 3: Implement immutable reducer state**

```ts
export interface CopilotRuntimeState {
  sessions: Record<string, CopilotSession>;
  activeSessionId: string | null;
  runs: Record<string, CopilotRunState>;
  lastSequenceByRun: Record<string, number>;
}

export function createCopilotRuntimeState(): CopilotRuntimeState {
  return {
    sessions: {},
    activeSessionId: null,
    runs: {},
    lastSequenceByRun: {},
  };
}

export function reduceCopilotEvent(
  state: CopilotRuntimeState,
  event: CopilotRunEvent,
): CopilotRuntimeState;
```

Return the same object for replayed or stale events. Upsert tool parts without changing prior part order. Append delta only to the matching message and part kind.

- [ ] **Step 4: Route legacy merge through a conversion seam**

Keep `applyRunMessageUpdate` exported for compatibility. Move the legacy `ChatMessage`-based `appendSubscriptionDelta`, text/tool/verification merge and `applyRunMessageUpdate` implementation to `features/chatbot/lib/chatbotLegacyMerge.ts`; `useChatbot.ts` re-exports the helper. The seam lives under `lib`, rather than `hooks`, because it is a pure compatibility helper and must not pretend to be a React hook. `core/copilot` implements separate helpers that consume only `CopilotMessagePart` and `CopilotRunEvent`. Neither `core/copilot` nor `shared/copilot` may import `@/core/types/chatbot.types`.

- [ ] **Step 5: Verify Gate 2**

Run: `cd frontend && npm test -- --run src/core/copilot src/features/chatbot/hooks/useChatbot && npm run typecheck:copilot && npm run build`

Expected: PASS for new reducer and all characterization tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/core/copilot frontend/src/features/chatbot/lib/chatbotLegacyMerge.ts frontend/src/features/chatbot/hooks/useChatbot.ts
git commit -m "refactor(copilot): extract pure stream reducer"
```

### Task 5: Define ports and reusable contract tests

**Files:**
- Create: `frontend/src/core/copilot/ports/copilotTransport.ts`
- Create: `frontend/src/core/copilot/ports/copilotSessionLocation.ts`
- Create: `frontend/src/core/copilot/ports/copilotStorage.ts`
- Create: `frontend/src/core/copilot/ports/copilotTranslations.ts`
- Create: `frontend/src/shared/copilot/testing/copilotTransportContract.ts`
- Modify: `frontend/src/core/copilot/index.ts`

**Interfaces:**
- Produces: `CopilotTransport`, `CopilotSessionLocation`, `CopilotStorage`, `CopilotTranslations`, `runCopilotTransportContract(createTransport)`.

- [ ] **Step 1: Write a failing contract suite declaration**

The reusable suite must test session CRUD, stable IDs/Dates, startRun, synchronous subscription close, no observer calls after close, normalized errors and capability/method consistency.

- [ ] **Step 2: Verify red**

Run: `cd frontend && npm run build`

Expected: FAIL because port modules and their exports are absent.

- [ ] **Step 3: Implement ports exactly as approved**

Use optional methods for cancellation, approval, answer, attachment and active-run lookup. Add a runtime assertion:

```ts
export function assertCopilotTransportCapabilities(
  transport: CopilotTransport,
): void;
```

It throws `CopilotError` with code `unsupported-capability` when a true capability lacks its method.

- [ ] **Step 4: Verify port compilation**

Run: `cd frontend && npm run build`

Expected: PASS; no React or infrastructure imports appear under `core/copilot`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/core/copilot frontend/src/shared/copilot/testing/copilotTransportContract.ts
git commit -m "feat(copilot): define external capability ports"
```

### Task 6: Build deterministic memory adapters

**Files:**
- Create: `frontend/src/shared/copilot/testing/MemoryCopilotTransport.ts`
- Create: `frontend/src/shared/copilot/testing/MemoryCopilotSessionLocation.ts`
- Create: `frontend/src/shared/copilot/testing/MemoryCopilotStorage.ts`
- Create: `frontend/src/shared/copilot/testing/MemoryCopilotTransport.test.ts`
- Create: `frontend/src/shared/copilot/testing/index.ts`

**Interfaces:**
- Produces: memory adapters used by all hook/UI tests and the future example app.

- [ ] **Step 1: Apply the transport contract suite to a missing memory adapter**

```ts
runCopilotTransportContract(() => new MemoryCopilotTransport());
```

- [ ] **Step 2: Verify red**

Run: `cd frontend && npm test -- --run src/shared/copilot/testing/MemoryCopilotTransport.test.ts`

Expected: FAIL because the adapter is missing.

- [ ] **Step 3: Implement deterministic adapters**

`MemoryCopilotTransport` stores sessions/runs in `Map`, exposes `emit(runId, event)`, `fail(runId, error)`, and returns an idempotent subscription. Location stores one ID and synchronously notifies a copied listener set. Storage wraps a `Map<string, string>`.

Export these adapters and `runCopilotTransportContract` only from `shared/copilot/testing/index.ts`. `shared/copilot/index.ts` must not import or re-export `testing/`, so the main entrypoint never pulls Vitest into production bundles.

- [ ] **Step 4: Verify contract**

Run: `cd frontend && npm test -- --run src/shared/copilot/testing`

Expected: PASS with the shared transport contract and adapter-specific event tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/shared/copilot/testing
git commit -m "test(copilot): add deterministic memory adapters"
```

### Task 7: Adapt the QJudge repository to CopilotTransport

**Files:**
- Create: `frontend/src/infrastructure/copilot/QJudgeCopilotTransport.ts`
- Create: `frontend/src/infrastructure/copilot/QJudgeCopilotTransport.test.ts`
- Create: `frontend/src/infrastructure/copilot/chatbotCopilotMapper.ts`
- Modify: `frontend/src/infrastructure/api/repositories/chatbot.repository.ts`

**Interfaces:**
- Consumes: existing `ChatbotRepository`, current DTO/SSE callbacks.
- Produces: `createQJudgeCopilotTransport(repository, uploadArtifact)` implementing `CopilotTransport`.

- [ ] **Step 1: Write adapter mapping tests**

Assert legacy message → parts conversion for text, thinking, tools, todo/data, verification/data and attachment metadata. Assert legacy callbacks → normalized `CopilotRunEvent` with monotonic sequence. Mock `uploadUserArtifact()` with an `ArtifactRecord` and assert the mapper returns:

```ts
{
  type: "attachment",
  id: artifact.id,
  name: artifact.filename,
  mediaType: artifact.content_type,
}
```

The adapter keeps QJudge-only `object_key`, checksum and size fields outside the public part. Artifact preview continues to resolve content by the public attachment `id` through the QJudge slot.

- [ ] **Step 2: Run adapter tests red**

Run: `cd frontend && npm test -- --run src/infrastructure/copilot/QJudgeCopilotTransport.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement the mapper and adapter**

Do not move HTTP/SSE parsing out of the existing repository yet. The adapter delegates repository calls, maps results, wraps `subscribeRunEvents` in `CopilotSubscription`, and maps AbortError to normal close rather than `CopilotError`.

- [ ] **Step 4: Run the reusable transport contract**

Instantiate the QJudge adapter with a fully mocked legacy repository and run `runCopilotTransportContract` in the adapter test.

- [ ] **Step 5: Verify Gate 3 transport**

Run: `cd frontend && npm test -- --run src/infrastructure/copilot src/infrastructure/api/repositories/chatbot.repository.test.ts && npm run build`

Expected: PASS for legacy repository and Copilot adapter suites.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/infrastructure/copilot frontend/src/infrastructure/api/repositories/chatbot.repository.ts
git commit -m "feat(copilot): adapt QJudge chat transport"
```

### Task 8: Implement location, storage and translation adapters

**Files:**
- Create: `frontend/src/infrastructure/copilot/BrowserCopilotStorage.ts`
- Create: `frontend/src/infrastructure/copilot/BrowserCopilotStorage.test.ts`
- Create: `frontend/src/infrastructure/copilot/BrowserCopilotSessionLocation.ts`
- Create: `frontend/src/infrastructure/copilot/BrowserCopilotSessionLocation.test.ts`
- Create: `frontend/src/shared/copilot/translations/DefaultCopilotTranslations.ts`
- Create: `frontend/src/shared/copilot/translations/DefaultCopilotTranslations.test.ts`
- Create: `frontend/src/features/chatbot/adapters/ReactRouterCopilotSessionLocation.ts`
- Create: `frontend/src/features/chatbot/adapters/ReactRouterCopilotSessionLocation.test.tsx`
- Create: `frontend/src/features/chatbot/adapters/QJudgeCopilotTranslations.ts`
- Modify: `frontend/src/features/chatbot/lib/aiSessionUrl.ts`

**Interfaces:**
- Produces: QJudge-compatible adapters while preserving `AI_SESSION_PARAM` and `useAiSessionParam`.

- [ ] **Step 1: Write adapter tests**

Test localStorage failures are swallowed; native query param set/remove preserves unrelated params and responds to `popstate`; React Router set/remove preserves unrelated params; default replace is true; default English covers every `CopilotTranslationKey`; QJudge translations map through `i18n.t("chatbot:...")`.

- [ ] **Step 2: Verify red**

Run: `cd frontend && npm test -- --run src/infrastructure/copilot/BrowserCopilotStorage.test.ts src/infrastructure/copilot/BrowserCopilotSessionLocation.test.ts src/shared/copilot/translations src/features/chatbot/adapters`

Expected: FAIL because adapters are missing.

- [ ] **Step 3: Implement adapters and legacy wrapper**

Keep `useAiSessionParam` as a wrapper around the new React Router adapter so existing callers do not change in this task.

- [ ] **Step 4: Verify adapters**

Run: `cd frontend && npm test -- --run src/infrastructure/copilot/BrowserCopilotStorage.test.ts src/infrastructure/copilot/BrowserCopilotSessionLocation.test.ts src/shared/copilot/translations src/features/chatbot/adapters && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/infrastructure/copilot frontend/src/shared/copilot/translations frontend/src/features/chatbot/adapters frontend/src/features/chatbot/lib/aiSessionUrl.ts
git commit -m "feat(copilot): add QJudge environment adapters"
```

### Task 9: Implement CopilotProvider session lifecycle

**Files:**
- Create: `frontend/src/shared/copilot/react/copilotContexts.ts`
- Create: `frontend/src/shared/copilot/react/CopilotProvider.tsx`
- Create: `frontend/src/shared/copilot/react/CopilotProvider.test.tsx`
- Create: `frontend/src/shared/copilot/hooks/useCopilotSessions.ts`

**Interfaces:**
- Consumes: Copilot ports, memory adapters, core reducer.
- Produces: Provider and `useCopilotSessions()` with the approved session API.

- [ ] **Step 1: Write Provider lifecycle tests**

Cover disabled, location over storage, invalid location fallback, `create|first|none`, session detail loading, fast selection revision, external location changes, rename, remove and unmount cleanup. Add `restores an active run on mount when resumableStreams is enabled`: `getActiveRun(sessionId)` returns a run with `lastSequence: 9`, Provider calls `subscribeRun(run, observer, { fromSequence: 9 })`, and the hook exposes that run for the active session.

- [ ] **Step 2: Verify red**

Run: `cd frontend && npm test -- --run src/shared/copilot/react/CopilotProvider.test.tsx`

Expected: FAIL because Provider/hooks are absent.

- [ ] **Step 3: Implement session state owner**

Use separate state and command contexts. Every load captures an incrementing `selectionRevisionRef`; only the latest revision may commit. One command handles both UI selection and location subscription, with a `source` flag preventing echo writes.

- [ ] **Step 4: Verify Provider session behavior**

Run: `cd frontend && npm test -- --run src/shared/copilot/react/CopilotProvider.test.tsx`

Expected: PASS for every selection policy and race case.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/shared/copilot/react frontend/src/shared/copilot/hooks/useCopilotSessions.ts
git commit -m "feat(copilot): add provider session lifecycle"
```

### Task 10: Implement run and composer hooks

**Files:**
- Create: `frontend/src/shared/copilot/hooks/useCopilotRun.ts`
- Create: `frontend/src/shared/copilot/hooks/useCopilotComposer.ts`
- Create: `frontend/src/shared/copilot/hooks/useCopilot.ts`
- Create: `frontend/src/shared/copilot/react/CopilotRunProvider.test.tsx`
- Modify: `frontend/src/shared/copilot/react/CopilotProvider.tsx`

**Interfaces:**
- Produces: approved run/composer/facade hooks and state transitions.

- [ ] **Step 1: Write run integration tests with MemoryCopilotTransport**

Cover submitted → streaming → ready, reconnect from sequence, approval failure retention, answer failure retention, stop/close ordering, unsupported capabilities, attachment upload failure and optimistic user message retry.

- [ ] **Step 2: Verify red**

Run: `cd frontend && npm test -- --run src/shared/copilot/react/CopilotRunProvider.test.tsx`

Expected: FAIL because run/composer hooks are absent.

- [ ] **Step 3: Implement run lifecycle**

Provider owns one subscription per active session. It closes the captured subscription synchronously before `cancelRun`, never reads a mutable subscription ref inside later promise handlers, and sends every observer event through `reduceCopilotEvent`.

- [ ] **Step 4: Implement composer lifecycle**

Composer keeps draft and failed attachments. `send()` validates, uploads sequentially for deterministic progress, appends an optimistic user message, starts the run, and returns `CopilotSendResult` instead of throwing expected transport errors.

- [ ] **Step 5: Verify Gate 4 runtime**

Run: `cd frontend && npm test -- --run src/shared/copilot src/core/copilot && npm run build`

Expected: PASS; no QJudge imports under `shared/copilot`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/shared/copilot
git commit -m "feat(copilot): add run and composer hooks"
```

### Task 11: Convert legacy useChatbot into a compatibility facade

**Files:**
- Modify: `frontend/src/features/chatbot/hooks/useChatbot.ts`
- Modify: `frontend/src/features/chatbot/contexts/ChatbotProvider.tsx`
- Create: `frontend/src/features/chatbot/adapters/legacyChatbotMapper.ts`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: CopilotProvider/hooks and QJudge adapters.
- Produces: unchanged `UseChatbotReturn` for existing consumers.

- [ ] **Step 1: Add a compatibility contract test**

Extend characterization tests to assert the complete key set returned by `useChatbot`, including models, sessions, current session, run flags, pending interactions and commands.

- [ ] **Step 2: Verify the test protects the current facade**

Run: `cd frontend && npm test -- --run src/features/chatbot/hooks/useChatbot`

Expected: PASS before refactor.

- [ ] **Step 3: Compose CopilotProvider in ChatbotProvider**

Create QJudge transport, Router location, browser storage and translations once with `useMemo`. Auth only determines `enabled`. ArtifactPanelProvider remains QJudge-specific and wraps the compatibility context.

- [ ] **Step 4: Rewrite useChatbot as a mapper over granular hooks**

Map parts back to legacy `ChatMessage`, run union back to booleans/pending cards, and commands back to legacy names. Remove direct imports of `chatbotRepository`, artifact repository, i18next, localStorage and URL state from `useChatbot.ts`.

- [ ] **Step 5: Verify no behavior regression**

Run: `cd frontend && npm test -- --run src/features/chatbot/hooks/useChatbot src/shared/copilot src/infrastructure/copilot && npm run build`

Expected: PASS with the same compatibility key set and behavior.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/chatbot frontend/src/App.tsx
git commit -m "refactor(chatbot): delegate legacy facade to Copilot runtime"
```

### Task 12: Extract scroll and selectors into public hooks

**Files:**
- Create: `frontend/src/shared/copilot/hooks/useCopilotScroll.ts`
- Create: `frontend/src/shared/copilot/hooks/useCopilotScroll.test.tsx`
- Create: `frontend/src/shared/copilot/hooks/useCopilotSessionLocation.ts`
- Create: `frontend/src/shared/copilot/hooks/useCopilotSessionLocation.test.tsx`
- Modify: `frontend/src/features/chatbot/hooks/useChatScrollToBottom.ts`
- Modify: `frontend/src/features/chatbot/components/chat-ui/SessionBadges.tsx`

**Interfaces:**
- Produces: generic scroll hook and location hook; legacy scroll hook remains a typed wrapper.

- [ ] **Step 1: Write scroll tests**

Mock `requestAnimationFrame` and element metrics. Cover session switch instant scroll, user message forced smooth scroll, assistant delta near-bottom follow, no yank while reading history, button threshold and listener cleanup.

- [ ] **Step 2: Verify red**

Run: `cd frontend && npm test -- --run src/shared/copilot/hooks/useCopilotScroll.test.tsx`

Expected: FAIL because the hook is absent.

- [ ] **Step 3: Implement hook and compatibility wrapper**

The generic hook consumes only message IDs/roles, active session ID, loading state and an optional interaction revision. Move `useSessionBadgeSummary` logic to a pure selector in QJudge feature; it is artifact-specific and does not enter package core.

- [ ] **Step 4: Verify hooks**

Run: `cd frontend && npm test -- --run src/shared/copilot/hooks src/features/chatbot/hooks/useChatbot && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/shared/copilot/hooks frontend/src/features/chatbot/hooks/useChatScrollToBottom.ts frontend/src/features/chatbot/components/chat-ui/SessionBadges.tsx
git commit -m "refactor(copilot): publish scroll and location hooks"
```

### Task 13: Build Carbon-free Copilot UI primitives

**Files:**
- Create: `frontend/src/shared/copilot/ui/CopilotMessageView.tsx`
- Create: `frontend/src/shared/copilot/ui/CopilotHeader.tsx`
- Create: `frontend/src/shared/copilot/ui/CopilotMessageList.tsx`
- Create: `frontend/src/shared/copilot/ui/CopilotComposer.tsx`
- Create: `frontend/src/shared/copilot/ui/CopilotHistoryPanel.tsx`
- Create: `frontend/src/shared/copilot/ui/CopilotApprovalCard.tsx`
- Create: `frontend/src/shared/copilot/ui/CopilotQuestionCard.tsx`
- Create: `frontend/src/shared/copilot/ui/CopilotScrollToLatestButton.tsx`
- Create: `frontend/src/shared/copilot/ui/copilot.css`
- Create: `frontend/src/shared/copilot/ui/CopilotUI.test.tsx`

**Interfaces:**
- Consumes: Provider hooks, approved UI props and slots.
- Produces: accessible default components with CSS variables and no Carbon dependency.

- [ ] **Step 1: Write accessibility and capability tests**

Test semantic message roles, composer label/submit, disabled send, stop visibility, approval buttons, question choices, session selection, error retry and custom message slot.

- [ ] **Step 2: Verify red**

Run: `cd frontend && npm test -- --run src/shared/copilot/ui/CopilotUI.test.tsx`

Expected: FAIL because UI primitives are absent.

- [ ] **Step 3: Implement minimal native HTML UI**

Use `button`, `textarea`, `nav`, `ol`, `article` and `role="log"`. Render text/reasoning/attachment parts by default. Tool/data parts use a renderer registry and fall back to an accessible summary; never stringify hidden backend error causes.

- [ ] **Step 4: Add stable CSS variables**

Define `--copilot-color-*`, `--copilot-space-*`, `--copilot-radius-*`, `--copilot-font-family`, `--copilot-panel-width` and `--copilot-composer-max-height`. Do not import QJudge Sass tokens.

- [ ] **Step 5: Verify UI primitives**

Run: `cd frontend && npm test -- --run src/shared/copilot/ui/CopilotUI.test.tsx && npm run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/shared/copilot/ui
git commit -m "feat(copilot): add accessible default UI primitives"
```

### Task 14: Build Workspace, Full Page and Embed shells

**Files:**
- Create: `frontend/src/shared/copilot/ui/CopilotWorkspaceShell.tsx`
- Create: `frontend/src/shared/copilot/ui/CopilotFullPageShell.tsx`
- Create: `frontend/src/shared/copilot/ui/CopilotEmbedShell.tsx`
- Create: `frontend/src/shared/copilot/ui/CopilotShells.test.tsx`
- Create: `frontend/src/shared/copilot/ui/__stories__/CopilotShells.stories.tsx`
- Modify: `frontend/src/shared/copilot/index.ts`

**Interfaces:**
- Produces: the three approved shell APIs and single public candidate entrypoint.

- [ ] **Step 1: Write shell contract tests**

Render all shells under one Provider and assert they observe the same location-selected session. Test workspace side/defaultOpen/disabled, full-page history modes, embed header/history flags, slots and container-safe height.

- [ ] **Step 2: Verify red**

Run: `cd frontend && npm test -- --run src/shared/copilot/ui/CopilotShells.test.tsx`

Expected: FAIL because shells are absent.

- [ ] **Step 3: Implement shells from shared primitives**

Workspace owns panel chrome only; FullPage owns page composition only; Embed owns container composition only. None reads Router, Auth, i18n or viewport-global QJudge state.

- [ ] **Step 4: Add Storybook coverage**

Stories: `WorkspaceDesktop`, `WorkspaceDisabled`, `FullPageSidebar`, `FullPageDrawer`, `EmbedCompact`, `AwaitingApproval`, `TransportError`. Use memory adapters only.

- [ ] **Step 5: Verify Gate 5**

Run: `cd frontend && npm test -- --run src/shared/copilot/ui && npm run build-storybook && npm run build`

Expected: PASS; Storybook builds without QJudge providers.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/shared/copilot
git commit -m "feat(copilot): add reusable chat shells"
```

### Task 15: Adopt shells in QJudge without removing compatibility UI

**Files:**
- Modify: `frontend/src/features/chatbot/components/ChatFullPage.tsx`
- Modify: `frontend/src/features/chatbot/components/ChatStandalonePage.tsx`
- Modify: `frontend/src/features/chatbot/components/workspace/WorkspaceShell.tsx`
- Modify: `frontend/src/features/chatbot/components/chat-ui/ChatContainer.tsx`
- Modify: `frontend/src/features/chatbot/index.ts`
- Create: `frontend/src/features/chatbot/components/CopilotShellIntegration.test.tsx`
- Create: `frontend/src/features/ai-tasks/hooks/useTaskSession.test.tsx`

**Interfaces:**
- Consumes: shared Copilot shells and QJudge slots/theme.
- Produces: current routes/layout using shared shell contracts while retaining QJudge names as wrappers.

- [ ] **Step 1: Write integration tests for the existing entrypoints**

Assert `/chat` uses full-page mode, workspace right panel uses workspace mode, embedded `ChatContainer` uses embed mode, all three share `ai_session_id`, and existing ArtifactPanel remains a QJudge slot. In `useTaskSession.test.tsx`, assert a matching session invokes `onMatch` and `onSessionResolved`, while no match invokes `onEmpty` only once per `resolveKey`; this protects AI Task auto-bind while the session source changes to Copilot hooks.

- [ ] **Step 2: Verify red against the desired composition**

Run: `cd frontend && npm test -- --run src/features/chatbot/components/CopilotShellIntegration.test.tsx`

Expected: FAIL because legacy components do not delegate to Copilot shells.

- [ ] **Step 3: Convert legacy components to wrappers**

Preserve current exports and props. Supply QJudge message/tool/artifact slots and CSS theme at the wrapper boundary. Do not move AI Task or artifact repositories into shared Copilot code.

- [ ] **Step 4: Verify QJudge consumers**

Run: `cd frontend && npm test -- --run src/features/chatbot src/features/ai-tasks/hooks/useTaskSession.test.tsx src/features/app/components/SideMenu.test.tsx src/features/contest/screens/settings/grading/GradingMatrixViewScreen.test.tsx src/features/contest/screens/settings/grading/GradingSplitPanelScreen.test.tsx && npm run build`

Expected: PASS for chatbot, SideMenu and both grading integration surfaces.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/chatbot frontend/src/features/ai-tasks/hooks/useTaskSession.test.tsx
git commit -m "refactor(chatbot): adopt shared Copilot shells"
```

### Task 16: Add package-boundary gates and readiness example

**Files:**
- Create: `frontend/scripts/check-copilot-package-boundary.js`
- Create: `frontend/examples/copilot-minimal/App.tsx`
- Create: `frontend/examples/copilot-minimal/main.tsx`
- Create: `frontend/examples/copilot-minimal/index.html`
- Create: `frontend/examples/copilot-minimal/README.md`
- Create: `frontend/vite.config.copilot-example.ts`
- Create: `frontend/src/shared/copilot/copilot.public-api.test.ts`
- Create: `frontend/type-tests/copilot.public-api.typecheck.ts`
- Modify: `frontend/package.json`
- Modify: `docs/superpowers/specs/2026-07-13-copilot-package-design.md`

**Interfaces:**
- Produces: executable import boundary, a non-QJudge smoke example and documented readiness evidence.

- [ ] **Step 1: Write a failing boundary check**

The script scans `src/core/copilot`, `src/shared/copilot` and the generic `src/infrastructure/copilot/BrowserCopilot*.ts` adapters. Import scanning rejects `@/features`, QJudge repositories, `@/core/types/chatbot.types`, `react-router`, `i18next` and `@carbon`; React is allowed only under `shared/copilot`. A separate full-file content scan rejects `.cds-`, `.bx-` and `!important` in CSS/SCSS/CSS-module files. Exclude `QJudgeCopilotTransport.ts` from the publishable candidate set.

- [ ] **Step 2: Add npm commands**

```json
{
  "check:copilot-boundary": "node scripts/check-copilot-package-boundary.js",
  "test:copilot": "vitest run src/core/copilot src/shared/copilot src/infrastructure/copilot src/features/chatbot",
  "build:copilot-example": "vite build --config vite.config.copilot-example.ts"
}
```

- [ ] **Step 3: Verify the boundary script catches a fixture violation**

Run the script against a temporary fixture directory accepted as a CLI argument; assert non-zero exit and the offending import. Remove the fixture in test cleanup.

- [ ] **Step 4: Add the minimal example**

Use `MemoryCopilotTransport`, `CopilotProvider` and `CopilotFullPageShell`. Configure Vite root as `examples/copilot-minimal` and alias the candidate entrypoint to `src/shared/copilot/index.ts`. The README contains install-shaped imports, transport replacement instructions and `npm run build:copilot-example`. It must not import QJudge Auth, Router, Carbon or i18next.

`copilot.public-api.test.ts` performs runtime assertions for value exports such as hooks, Provider and shells. `type-tests/copilot.public-api.typecheck.ts` imports all approved public types and values and assigns representative values so `npm run typecheck:copilot` catches missing or incompatible declarations. Import memory adapters and `runCopilotTransportContract` only from `@/shared/copilot/testing`; add an assertion that the main `@/shared/copilot` entrypoint has no `testing` export.

- [ ] **Step 5: Run all readiness gates**

Run:

```bash
cd frontend
npm run check:copilot-boundary
npm run test:copilot
npm run typecheck:copilot
npm run build:copilot-example
npm run build
npm run build-storybook
cd ..
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-naming.js --root frontend/src
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-architecture.js --root frontend/src --policy compat
```

Expected: Copilot boundary, runtime tests, dedicated compile-time assertions, minimal example build, application build and Storybook pass. Naming output may still include repository-wide historical violations, but must contain no new `core/copilot` or `shared/copilot` violation. Architecture compat must pass.

- [ ] **Step 6: Update readiness evidence in the design doc**

Record the command results, remaining extraction blockers and whether all ten success conditions in spec section 18 are met. Do not mark package publishing ready while any condition is false.

- [ ] **Step 7: Commit**

```bash
git add frontend/scripts/check-copilot-package-boundary.js frontend/examples/copilot-minimal frontend/src/shared/copilot/copilot.public-api.test.ts frontend/type-tests/copilot.public-api.typecheck.ts frontend/package.json frontend/vite.config.copilot-example.ts docs/superpowers/specs/2026-07-13-copilot-package-design.md
git commit -m "chore(copilot): enforce package readiness gates"
```

---

## Final Verification

- [ ] Run `cd frontend && npm run check:copilot-boundary` — expected exit 0.
- [ ] Run `cd frontend && npm run test:copilot` — expected all Copilot and compatibility tests pass.
- [ ] Run `cd frontend && npm run typecheck:copilot` — expected all discriminated union and public API compile-time assertions pass.
- [ ] Run `cd frontend && npm run build` — expected TypeScript and Vite build pass.
- [ ] Run `cd frontend && npm run build-storybook` — expected Storybook static build pass.
- [ ] Run naming and architecture gates — expected no new Copilot violations and compat architecture pass.
- [ ] Inspect `git diff --stat` — expected each implementation PR stays near the QJudge <=20 files / <=400 changed lines target; split Gate 4 and Gate 5 further if they exceed it.
- [ ] Confirm `useChatbot.ts` has no imports from repositories, i18next, localStorage or URL helpers.
- [ ] Confirm `core/copilot` and `shared/copilot` contain no QJudge-specific imports.
- [ ] Confirm full-page, workspace, embed, HITL, question, attachment and AI Task binding regression tests pass.
