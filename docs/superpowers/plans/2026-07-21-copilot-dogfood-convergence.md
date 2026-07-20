# Copilot Dogfood Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 QJudge production chat 只經由 Copilot 公開 API 運作，完整移除 `useLegacyChatbotRuntime`、`useChatbot` 與 legacy chatbot contexts，同時維持現有使用者行為。

**Architecture:** `CopilotProvider` 是 session、run、composer、models 與 subscription 的唯一 runtime owner；QJudge 以 `QJudgeCopilotProvider` 注入 transport、location、storage、translations 與 model catalog。QJudge chat surface 使用 `CopilotPanel`、shells、slots 與公開 `useCopilot*`，產品特化只存在於 QJudge adapters、slots、renderers 與 Artifact integration。

**Tech Stack:** React 19、TypeScript 5.9、Vitest 4、Testing Library、Vite 7、Storybook 9、Sass modules、React Router、Carbon React（僅 QJudge UI）。

## Global Constraints

- 設計依據：`docs/superpowers/specs/2026-07-21-copilot-dogfood-convergence-design.md`；本文件取代舊 plan 中保留 `useChatbot` facade 的工作。
- 本階段不建立 npm workspace package、不發布 npm、不改 backend／ai-service API contract。
- 使用者可見行為不得改變：session URL、full/workspace/embed、SSE、HITL、models、attachments、Artifact Panel、composer 與 scroll 都要保留。
- `CopilotProvider` 是唯一 session、run、composer、models 與 subscription state owner；不得新增 QJudge runtime mirror state。
- QJudge production code 只能從 `@copilot` 取得 Copilot exports；tests 只能從 `@copilot/testing` 取得 testing utilities。
- `core/copilot` 不得 import React、DOM、Router、i18next、Carbon、features 或 infrastructure。
- `shared/copilot` 不得 import QJudge features、repositories、Router、i18next 或 Carbon。
- Chatbot repository 只能由 `frontend/src/infrastructure/copilot` adapters 使用。
- Copilot candidate 不得包含 QJudge model IDs、`ai_session_id`、QJudge translation namespaces 或 Artifact repository types。
- 預設 Copilot UI 不得使用 `.cds-*`、`.bx-*` 或 `!important`。
- 每個 task 先寫會失敗的測試，再加入最小實作，最後建立一個可獨立 review 的 commit。
- Type-only assertions 必須經 `npm run typecheck:copilot`，不能依賴 Vitest runtime 假裝檢查 TypeScript。
- 不在 production 同時掛載 legacy runtime 與 `CopilotProvider`。
- 使用者既有未追蹤檔 `ai-service/.deepagents/skills/rubric.md`、`ai-service/.deepagents/tmp_grade.csv` 不得 stage、修改或刪除。

---

## File Map

### Copilot public boundary

- `frontend/src/core/copilot/copilot.types.ts`：session、message、run、model 與 error types。
- `frontend/src/core/copilot/copilotEvent.types.ts`：transport-normalized events，包含 run notice。
- `frontend/src/core/copilot/ports/copilotModelCatalog.ts`：動態 model list port。
- `frontend/src/core/copilot/index.ts`：pure core exports。
- `frontend/src/shared/copilot/index.ts`：`@copilot` production public entry。
- `frontend/src/shared/copilot/testing/index.ts`：`@copilot/testing` entry。
- `frontend/src/shared/copilot/testing/memoryCopilotModelCatalog.ts`：model catalog test adapter。
- `frontend/src/shared/copilot/hooks/useCopilotModels.ts`：model state public hook。
- `frontend/src/shared/copilot/react/copilotContexts.ts`：session、run、composer、model contexts。
- `frontend/src/shared/copilot/react/CopilotProvider.tsx`：唯一 runtime owner。
- `frontend/src/shared/copilot/ui/copilotUI.types.ts`：panel slot contracts。
- `frontend/src/shared/copilot/ui/CopilotPanel.tsx`：default orchestration。
- `frontend/src/shared/copilot/ui/CopilotMessageList.tsx`：default list 與 list slot contract。

### QJudge adapters and composition

- `frontend/src/infrastructure/copilot/qJudgeCopilotTransport.ts`：chatbot repository → `CopilotTransport`。
- `frontend/src/infrastructure/copilot/qJudgeCopilotModelCatalog.ts`：`getModels()` → `CopilotModelCatalog`。
- `frontend/src/infrastructure/copilot/qJudgeCopilotDependencies.ts`：production adapter instances；repository imports 只留在此 infrastructure boundary。
- `frontend/src/features/chatbot/adapters/reactRouterCopilotSessionLocation.ts`：`ai_session_id` Router adapter。
- `frontend/src/features/chatbot/adapters/qJudgeCopilotTranslations.ts`：QJudge i18n adapter。
- `frontend/src/features/chatbot/contexts/QJudgeCopilotProvider.tsx`：Auth-aware composition root。
- `frontend/src/features/chatbot/adapters/qJudgeCopilotMessageData.ts`：QJudge data-part pure selectors。
- `frontend/src/features/chatbot/components/chat-ui/qJudgeCopilotSlots.tsx`：stable QJudge slot registry。
- `frontend/src/features/chatbot/components/chat-ui/QJudgeChatPanel.tsx`：panel mode／Artifact layout composition，無 runtime ownership。

### QJudge presentation consumers

- `frontend/src/features/chatbot/components/chat-ui/MessageBubble.tsx`：`CopilotMessage` renderer。
- `frontend/src/features/chatbot/components/chat-ui/MessageList.tsx`：QJudge visual list slot。
- `frontend/src/features/chatbot/components/chat-ui/ChainOfThought.tsx`：`CopilotToolPart` renderer。
- `frontend/src/features/chatbot/components/chat-ui/HITLCard.tsx`：`CopilotApprovalRequest` renderer。
- `frontend/src/features/chatbot/components/chat-ui/QuestionCard.tsx`：`CopilotQuestionRequest` renderer。
- `frontend/src/features/chatbot/components/chat-ui/ComposerBar.tsx`：QJudge composer slot。
- `frontend/src/features/chatbot/components/chat-ui/ChatTopBar.tsx`：QJudge header slot。
- `frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.tsx`：QJudge history slot。
- `frontend/src/features/chatbot/components/chat-ui/SessionBadges.tsx`：Copilot todo/artifact badges。
- `frontend/src/features/chatbot/contexts/ArtifactPanelContext.tsx`：active Copilot session 的 QJudge artifact state。
- `frontend/src/features/app/components/SideMenu.tsx`：session commands consumer。
- `frontend/src/features/contest/screens/settings/ContestAiGradingScreen.tsx`：grading consumer。

### Gates and deletion

- `frontend/scripts/check-copilot-package-boundary.js`：candidate purity gate。
- `frontend/scripts/check-copilot-dogfood-boundary.js`：QJudge public-entry／legacy absence gate。
- `frontend/src/test/architecture/copilotDogfoodBoundary.test.ts`：dogfood gate regression test。
- `frontend/type-tests/copilot.public-api.typecheck.ts`：public import compile check。
- Delete legacy runtime/context files only in Task 12 after all consumers compile.

---

### Task 1: Establish the in-repository package facade

**Files:**
- Modify: `frontend/tsconfig.app.json`
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/vitest.config.ts`
- Modify: `frontend/.storybook/main.ts`
- Modify: `frontend/vite.config.copilot-example.ts`
- Modify: `frontend/examples/copilot-minimal/App.tsx`
- Modify: `frontend/type-tests/copilot.public-api.typecheck.ts`
- Modify: `frontend/src/shared/copilot/copilotPublicApi.test.ts`

**Interfaces:**
- Produces: `@copilot` → `src/shared/copilot/index.ts` and `@copilot/testing` → `src/shared/copilot/testing/index.ts` in TypeScript, Vite, Vitest, Storybook and example builds.
- Produces: compile/runtime proof that testing helpers are not exported from `@copilot`.

- [ ] **Step 1: Change the public API type test to use package-style imports**

Replace `frontend/type-tests/copilot.public-api.typecheck.ts` imports with:

```ts
import {
  CopilotFullPageShell,
  CopilotProvider,
  useCopilot,
  type CopilotActiveSessionState,
  type CopilotRunState,
  type CopilotSendResult,
  type CopilotTransport,
  type CopilotWorkspaceShellProps,
  type UseCopilotComposerResult,
} from "@copilot";
import {
  MemoryCopilotTransport,
  runCopilotTransportContract,
} from "@copilot/testing";

const transport: CopilotTransport = new MemoryCopilotTransport();
const active: CopilotActiveSessionState = {
  status: "empty",
  id: null,
  data: null,
  error: null,
};
const run: CopilotRunState = { status: "ready", run: null };
const result: CopilotSendResult = { accepted: false, sessionId: "" };
const workspace: CopilotWorkspaceShellProps = {
  children: null,
  side: "right",
};
void [
  CopilotProvider,
  CopilotFullPageShell,
  useCopilot,
  runCopilotTransportContract,
  transport,
  active,
  run,
  result,
  workspace,
];
declare const composer: UseCopilotComposerResult;
composer.setSelectedModel(null);
```

- [ ] **Step 2: Run typecheck to verify the facade is unresolved**

Run: `cd frontend && npm run typecheck:copilot`

Expected: FAIL with `TS2307: Cannot find module '@copilot'` or `TS2307: Cannot find module '@copilot/testing'`.

- [ ] **Step 3: Add aliases to every build/test surface**

Add these exact path entries after `"@/*"` in `tsconfig.app.json`:

```json
"@/*": ["src/*"],
"@copilot": ["src/shared/copilot/index.ts"],
"@copilot/testing": ["src/shared/copilot/testing/index.ts"]
```

Add the two exact aliases before `"@"` in `vite.config.ts`, `vitest.config.ts` and `.storybook/main.ts` using each file's existing path helper:

```ts
"@copilot/testing": path.resolve(__dirname, "./src/shared/copilot/testing/index.ts"),
"@copilot": path.resolve(__dirname, "./src/shared/copilot/index.ts"),
```

In `.storybook/main.ts`, use `"../src/..."` because `__dirname` is `.storybook`. In `vite.config.copilot-example.ts`, replace `@copilot-testing` with `@copilot/testing`. Update the minimal example import to:

```ts
import { CopilotFullPageShell, CopilotProvider } from "@copilot";
import { MemoryCopilotTransport } from "@copilot/testing";
```

- [ ] **Step 4: Make the runtime export test consume `@copilot`**

Replace the relative namespace import in `copilotPublicApi.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import * as copilot from "@copilot";

describe("Copilot public API", () => {
  it("exports production APIs without testing helpers", () => {
    for (const name of [
      "CopilotProvider",
      "CopilotPanel",
      "useCopilot",
      "useCopilotSessions",
      "useCopilotRun",
      "useCopilotComposer",
      "useCopilotScroll",
      "useCopilotSessionLocation",
      "CopilotWorkspaceShell",
      "CopilotFullPageShell",
      "CopilotEmbedShell",
    ]) {
      expect(copilot).toHaveProperty(name);
    }
    expect(copilot).not.toHaveProperty("MemoryCopilotTransport");
  });
});
```

- [ ] **Step 5: Verify all facade consumers**

Run: `cd frontend && npm run typecheck:copilot && npm test -- --run src/shared/copilot/copilotPublicApi.test.ts && npm run build:copilot-example`

Expected: typecheck PASS, 1 public API test PASS, minimal example build PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/tsconfig.app.json frontend/vite.config.ts frontend/vitest.config.ts frontend/.storybook/main.ts frontend/vite.config.copilot-example.ts frontend/examples/copilot-minimal/App.tsx frontend/type-tests/copilot.public-api.typecheck.ts frontend/src/shared/copilot/copilotPublicApi.test.ts
git commit -m "chore(copilot): establish public facade aliases"
```

### Task 2: Add the model catalog port and public hook

**Files:**
- Create: `frontend/src/core/copilot/ports/copilotModelCatalog.ts`
- Create: `frontend/src/shared/copilot/hooks/useCopilotModels.ts`
- Create: `frontend/src/shared/copilot/testing/memoryCopilotModelCatalog.ts`
- Create: `frontend/src/shared/copilot/hooks/useCopilotModels.test.tsx`
- Modify: `frontend/src/core/copilot/copilot.types.ts`
- Modify: `frontend/src/core/copilot/index.ts`
- Modify: `frontend/src/shared/copilot/react/copilotContexts.ts`
- Modify: `frontend/src/shared/copilot/react/CopilotProvider.tsx`
- Modify: `frontend/src/shared/copilot/testing/index.ts`
- Modify: `frontend/src/shared/copilot/index.ts`
- Modify: `frontend/type-tests/copilot.public-api.typecheck.ts`

**Interfaces:**
- Produces: `CopilotModel`, `CopilotModelCatalog`, `CopilotModelStatus`, `useCopilotModels(): UseCopilotModelsResult`.
- Changes: `CopilotProviderProps` gains `modelCatalog?: CopilotModelCatalog` and `fallbackModels?: readonly CopilotModel[]`.
- Storage key: `copilot:last-model-id`.

- [ ] **Step 1: Write failing model hook tests**

Create `useCopilotModels.test.tsx` with these complete cases:

```tsx
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it } from "vitest";
import { MemoryCopilotModelCatalog } from "@copilot/testing";
import { MemoryCopilotStorage } from "@copilot/testing";
import { MemoryCopilotTransport } from "@copilot/testing";
import { CopilotProvider } from "../react/CopilotProvider";
import { useCopilotModels } from "./useCopilotModels";

const models = [
  { id: "model-a", displayName: "Model A" },
  { id: "model-b", displayName: "Model B", isDefault: true },
];

describe("useCopilotModels", () => {
  it("restores a valid stored model", async () => {
    const storage = new MemoryCopilotStorage();
    storage.set("copilot:last-model-id", "model-a");
    const catalog = new MemoryCopilotModelCatalog(models);
    const wrapper = ({ children }: PropsWithChildren) => (
      <CopilotProvider
        transport={new MemoryCopilotTransport()}
        storage={storage}
        modelCatalog={catalog}
      >
        {children}
      </CopilotProvider>
    );

    const { result } = renderHook(() => useCopilotModels(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.models).toEqual(models);
    expect(result.current.selectedModelId).toBe("model-a");
  });

  it("uses fallback models when the catalog fails", async () => {
    const catalog = new MemoryCopilotModelCatalog();
    catalog.fail(new Error("offline"));
    const wrapper = ({ children }: PropsWithChildren) => (
      <CopilotProvider
        transport={new MemoryCopilotTransport()}
        modelCatalog={catalog}
        fallbackModels={models}
      >
        {children}
      </CopilotProvider>
    );

    const { result } = renderHook(() => useCopilotModels(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("error"));

    expect(result.current.models).toEqual(models);
    expect(result.current.selectedModelId).toBe("model-b");
    expect(result.current.error?.operation).toBe("load-models");
  });

  it("persists an explicit selection", async () => {
    const storage = new MemoryCopilotStorage();
    const wrapper = ({ children }: PropsWithChildren) => (
      <CopilotProvider
        transport={new MemoryCopilotTransport()}
        storage={storage}
        modelCatalog={new MemoryCopilotModelCatalog(models)}
      >
        {children}
      </CopilotProvider>
    );
    const { result } = renderHook(() => useCopilotModels(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => result.current.select("model-a"));

    expect(storage.get("copilot:last-model-id")).toBe("model-a");
  });
});
```

- [ ] **Step 2: Run the focused test to verify red**

Run: `cd frontend && npm test -- --run src/shared/copilot/hooks/useCopilotModels.test.tsx`

Expected: FAIL because `CopilotModel`, `MemoryCopilotModelCatalog` and `useCopilotModels` do not exist.

- [ ] **Step 3: Define the core model contract**

Add to `copilot.types.ts`:

```ts
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
```

Add `"load-models"` to `CopilotError["operation"]`. Create `copilotModelCatalog.ts`:

```ts
import type {
  CopilotModel,
  CopilotRequestOptions,
} from "../copilot.types";

export interface CopilotModelCatalog {
  list(options?: CopilotRequestOptions): Promise<readonly CopilotModel[]>;
}
```

Export these types from both core and production public entries.

- [ ] **Step 4: Add the deterministic memory catalog**

Create `memoryCopilotModelCatalog.ts`:

```ts
import type {
  CopilotModel,
  CopilotModelCatalog,
} from "@/core/copilot";

export class MemoryCopilotModelCatalog implements CopilotModelCatalog {
  private models: readonly CopilotModel[];
  private failure: unknown = null;

  constructor(models: readonly CopilotModel[] = []) {
    this.models = [...models];
  }

  replace(models: readonly CopilotModel[]): void {
    this.models = [...models];
    this.failure = null;
  }

  fail(error: unknown): void {
    this.failure = error;
  }

  async list(): Promise<readonly CopilotModel[]> {
    if (this.failure) throw this.failure;
    return [...this.models];
  }
}
```

Export it only from `@copilot/testing`.

- [ ] **Step 5: Add model context and hook**

Add this context contract to `copilotContexts.ts`:

```ts
export interface CopilotModelContextValue {
  models: readonly CopilotModel[];
  status: CopilotModelStatus;
  selectedModelId: string | null;
  error: CopilotError | null;
  select(id: string | null): void;
  refresh(): Promise<void>;
}

export const CopilotModelContext = createContext<
  CopilotModelContextValue | undefined
>(undefined);

export function useCopilotModelContext(): CopilotModelContextValue {
  const value = useContext(CopilotModelContext);
  if (!value) {
    throw new Error("Copilot hooks must be used inside CopilotProvider");
  }
  return value;
}
```

Create `useCopilotModels.ts`:

```ts
import { useCopilotModelContext } from "../react/copilotContexts";

export type UseCopilotModelsResult = ReturnType<
  typeof useCopilotModelContext
>;

export function useCopilotModels(): UseCopilotModelsResult {
  return useCopilotModelContext();
}
```

- [ ] **Step 6: Make `CopilotProvider` own model loading and selection**

Add `modelCatalog`, `fallbackModels = []`, model state, and a `refreshModels()` callback. The callback must implement this exact selection order:

```ts
const chooseModelId = (
  models: readonly CopilotModel[],
  storedId: string | null,
): string | null => {
  if (storedId && models.some((model) => model.id === storedId)) {
    return storedId;
  }
  return models.find((model) => model.isDefault)?.id ?? models[0]?.id ?? null;
};
```

When no catalog exists, set `{ models: fallbackModels, status: "unavailable" }`. On catalog failure, keep `fallbackModels`, set status `error`, and normalize operation to `load-models`. Make the existing composer send path read the selected ID from a ref; remove model selection ownership from `CopilotComposerContext` and let `useCopilotModels()` be the only selection API.

- [ ] **Step 7: Move model selection in the public type test to the model hook**

In `copilot.public-api.typecheck.ts`, import `useCopilotModels` and `UseCopilotModelsResult`, remove `UseCopilotComposerResult` and `composer.setSelectedModel(null)`, then add:

```ts
declare const modelRuntime: UseCopilotModelsResult;
modelRuntime.select(null);
void useCopilotModels;
```

- [ ] **Step 8: Verify models and public type contracts**

Run: `cd frontend && npm test -- --run src/shared/copilot/hooks/useCopilotModels.test.tsx && npm run typecheck:copilot && npm run test:copilot`

Expected: model hook tests PASS, typecheck PASS, existing Copilot suites PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/core/copilot frontend/src/shared/copilot frontend/type-tests/copilot.public-api.typecheck.ts
git commit -m "feat(copilot): add model catalog runtime"
```

### Task 3: Complete the session bootstrap and mutation state

**Files:**
- Create: `frontend/src/shared/copilot/react/copilotSessionBootstrap.ts`
- Create: `frontend/src/shared/copilot/react/copilotSessionBootstrap.test.ts`
- Modify: `frontend/src/core/copilot/copilot.types.ts`
- Modify: `frontend/src/shared/copilot/react/copilotContexts.ts`
- Modify: `frontend/src/shared/copilot/react/CopilotProvider.tsx`
- Modify: `frontend/src/shared/copilot/hooks/useCopilotSessions.ts`
- Modify: `frontend/src/shared/copilot/react/CopilotProvider.test.tsx`
- Modify: `frontend/src/shared/copilot/testing/memoryCopilotTransport.ts`

**Interfaces:**
- Produces: `CopilotInitialSessionStrategy = "none" | "first" | "create" | "first-or-create"`.
- Produces: `resolveCopilotSessionBootstrap(input): Promise<CopilotSessionBootstrapResult>`.
- Changes: `useCopilotSessions()` exposes `error`, `clearError()` and `create(): Promise<string | null>`.

- [ ] **Step 1: Add failing bootstrap tests**

Create `copilotSessionBootstrap.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { CopilotSession, CopilotSessionSummary } from "@copilot";
import { resolveCopilotSessionBootstrap } from "./copilotSessionBootstrap";

const first: CopilotSessionSummary = {
  id: "session-1",
  title: "First",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};
const hidden: CopilotSession = {
  ...first,
  id: "session-hidden",
  title: "Hidden",
  messages: [],
};

describe("resolveCopilotSessionBootstrap", () => {
  it("loads a located session even when it is absent from the list", async () => {
    const load = vi.fn().mockResolvedValue(hidden);
    const result = await resolveCopilotSessionBootstrap({
      listed: [first],
      locatedId: hidden.id,
      storedId: null,
      strategy: "first-or-create",
      load,
    });

    expect(load).toHaveBeenCalledWith(hidden.id);
    expect(result.selectedSession).toEqual(hidden);
    expect(result.sessions.map((session) => session.id)).toEqual([
      hidden.id,
      first.id,
    ]);
    expect(result.clearLocation).toBe(false);
  });

  it("falls back to the first session for a confirmed missing location", async () => {
    const missing = Object.assign(new Error("missing"), {
      code: "not-found",
      operation: "load-session",
      recoverable: false,
    });
    const result = await resolveCopilotSessionBootstrap({
      listed: [first],
      locatedId: "missing",
      storedId: null,
      strategy: "first-or-create",
      load: vi.fn().mockRejectedValue(missing),
    });

    expect(result.selectedId).toBe(first.id);
    expect(result.clearLocation).toBe(true);
    expect(result.create).toBe(false);
  });

  it("preserves a transiently failing location", async () => {
    const offline = Object.assign(new Error("offline"), {
      code: "transport-error",
      operation: "load-session",
      recoverable: true,
    });
    await expect(
      resolveCopilotSessionBootstrap({
        listed: [first],
        locatedId: "session-offline",
        storedId: null,
        strategy: "first-or-create",
        load: vi.fn().mockRejectedValue(offline),
      }),
    ).rejects.toBe(offline);
  });

  it("requests creation only when first-or-create receives an empty list", async () => {
    const result = await resolveCopilotSessionBootstrap({
      listed: [],
      locatedId: null,
      storedId: null,
      strategy: "first-or-create",
      load: vi.fn(),
    });
    expect(result).toMatchObject({ selectedId: null, create: true });
  });
});
```

- [ ] **Step 2: Run the bootstrap test to verify red**

Run: `cd frontend && npm test -- --run src/shared/copilot/react/copilotSessionBootstrap.test.ts`

Expected: FAIL because `resolveCopilotSessionBootstrap` is missing.

- [ ] **Step 3: Implement the bootstrap resolver**

Create a pure decision module with these exported contracts:

```ts
export interface CopilotSessionBootstrapInput {
  listed: readonly CopilotSessionSummary[];
  locatedId: string | null;
  storedId: string | null;
  strategy: CopilotInitialSessionStrategy;
  load(id: string): Promise<CopilotSession>;
}

export interface CopilotSessionBootstrapResult {
  sessions: CopilotSessionSummary[];
  selectedId: string | null;
  selectedSession: CopilotSession | null;
  create: boolean;
  clearLocation: boolean;
}
```

The implementation must try `locatedId` before validating it against the list, only clear it for `not-found` or `forbidden`, then use valid stored ID, first item, or creation according to the strategy. Add `not-found` and `forbidden` to `CopilotErrorCode`.

- [ ] **Step 4: Write provider integration tests for first-or-create and command errors**

Add these cases to `CopilotProvider.test.tsx`:

```tsx
it("selects the first listed session without creating another one", async () => {
  const transport = new MemoryCopilotTransport();
  const existing = await transport.createSession({ title: "Existing" });
  const create = vi.spyOn(transport, "createSession");

  const { result } = renderHook(() => useCopilotSessions(), {
    wrapper: createWrapper({ transport, initialSession: "first-or-create" }),
  });

  await waitFor(() => expect(result.current.activeSession.id).toBe(existing.id));
  expect(create).not.toHaveBeenCalled();
});

it("keeps session state and exposes an error when rename fails", async () => {
  const transport = new MemoryCopilotTransport();
  const existing = await transport.createSession({ title: "Existing" });
  vi.spyOn(transport, "renameSession").mockRejectedValue(new Error("offline"));

  const { result } = renderHook(() => useCopilotSessions(), {
    wrapper: createWrapper({ transport, initialSession: "first" }),
  });
  await waitFor(() => expect(result.current.activeSession.id).toBe(existing.id));

  await act(async () => result.current.rename(existing.id, "Changed"));

  expect(result.current.sessions[0]?.title).toBe("Existing");
  expect(result.current.error?.operation).toBe("update-session");
});
```

Use the existing `createWrapper()` helper already declared at the top of `CopilotProvider.test.tsx`; do not introduce a second test-only provider.

- [ ] **Step 5: Integrate bootstrap and session error state in `CopilotProvider`**

Replace the initialization selection block with the resolver result. If `selectedSession` exists, insert it directly into runtime and call `restoreRun`; otherwise call `selectSession(selectedId, "initial")`. If `create` is true, call `create()`. If resolver throws a recoverable load error, set the active session error and retain location.

Catch create/rename/remove/refresh failures inside provider, keep prior list/runtime, set `sessionError`, and expose it through `useCopilotSessions()`. `clearError()` clears only session command error; active load errors remain part of `CopilotActiveSessionState`.

- [ ] **Step 6: Verify session lifecycle**

Run: `cd frontend && npm test -- --run src/shared/copilot/react/copilotSessionBootstrap.test.ts src/shared/copilot/react/CopilotProvider.test.tsx && npm run typecheck:copilot`

Expected: bootstrap tests PASS, provider session tests PASS, typecheck PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/core/copilot/copilot.types.ts frontend/src/shared/copilot/react frontend/src/shared/copilot/hooks/useCopilotSessions.ts frontend/src/shared/copilot/testing/memoryCopilotTransport.ts
git commit -m "feat(copilot): complete session bootstrap lifecycle"
```

### Task 4: Normalize run notices, data parts and durable HITL recovery

**Files:**
- Modify: `frontend/src/core/copilot/copilot.types.ts`
- Modify: `frontend/src/core/copilot/copilotEvent.types.ts`
- Modify: `frontend/src/core/copilot/copilotReducer.ts`
- Modify: `frontend/src/core/copilot/copilotReducer.test.ts`
- Modify: `frontend/src/shared/copilot/react/CopilotProvider.tsx`
- Modify: `frontend/src/shared/copilot/react/CopilotRunProvider.test.tsx`
- Modify: `frontend/src/shared/copilot/hooks/useCopilotRun.ts`
- Modify: `frontend/src/infrastructure/copilot/qJudgeCopilotTransport.ts`
- Modify: `frontend/src/infrastructure/copilot/qJudgeCopilotTransport.test.ts`

**Interfaces:**
- Produces: `run-notice` event and `useCopilotRun().notice`.
- Changes: awaiting approval/answer variants retain `interactionError?: CopilotError`.
- Guarantees: successful approval/answer subscribes to the returned run; failed submit preserves the request; recoverable subscription errors resume from last sequence with one subscription.

- [ ] **Step 1: Add a reducer test for run notices**

Add these cases to `copilotReducer.test.ts`:

```ts
it("stores and clears a run notice", () => {
  const running = reduceCopilotEvent(makeState(), {
    type: "run-notice",
    runId: "run-1",
    sessionId: "session-1",
    sequence: 1,
    notice: "Summarizing conversation",
  });
  expect(running.runs["session-1"]?.run?.metadata?.notice).toBe(
    "Summarizing conversation",
  );

  const cleared = reduceCopilotEvent(running, {
    type: "run-notice",
    runId: "run-1",
    sessionId: "session-1",
    sequence: 2,
    notice: null,
  });
  expect(cleared.runs["session-1"]?.run?.metadata?.notice).toBeUndefined();
});
```

- [ ] **Step 2: Add failing provider tests for resumed subscriptions**

First add `CopilotInitialSessionStrategy` to the existing `@/core/copilot` type import, then change the test helper so the test can restore a pre-existing run:

```tsx
function wrapper(
  transport: MemoryCopilotTransport,
  initialSession: CopilotInitialSessionStrategy = "create",
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <CopilotProvider transport={transport} initialSession={initialSession}>
        {children}
      </CopilotProvider>
    );
  };
}
```

Then add to `CopilotRunProvider.test.tsx`:

```tsx
it("subscribes to the run returned by submitAnswer", async () => {
  const transport = new MemoryCopilotTransport();
  const session = await transport.createSession();
  const run = await transport.startRun({ sessionId: session.id, text: "start" });
  const subscribe = vi.spyOn(transport, "subscribeRun");
  const { result } = renderHook(() => useCopilotRun(), {
    wrapper: wrapper(transport, "first"),
  });
  await waitFor(() => expect(subscribe).toHaveBeenCalled());
  act(() => {
    transport.emit(run.id, {
      type: "awaiting-answer",
      runId: run.id,
      sessionId: session.id,
      sequence: 1,
      request: { question: "Continue?", input: "text" },
    });
  });

  await act(async () => result.current.submitAnswer("yes"));

  expect(subscribe).toHaveBeenCalledTimes(2);
  expect(result.current.state.status).toBe("streaming");
});

it("keeps the question available when submitAnswer fails", async () => {
  const transport = new MemoryCopilotTransport();
  const session = await transport.createSession();
  const run = await transport.startRun({ sessionId: session.id, text: "start" });
  vi.spyOn(transport, "submitAnswer").mockRejectedValue(new Error("offline"));
  const { result } = renderHook(() => useCopilotRun(), {
    wrapper: wrapper(transport, "first"),
  });
  act(() => {
    transport.emit(run.id, {
      type: "awaiting-answer",
      runId: run.id,
      sessionId: session.id,
      sequence: 1,
      request: { question: "Continue?", input: "text" },
    });
  });

  await act(async () => result.current.submitAnswer("yes"));

  expect(result.current.state.status).toBe("awaiting-answer");
  if (result.current.state.status === "awaiting-answer") {
    expect(result.current.state.request.question).toBe("Continue?");
    expect(result.current.state.interactionError?.operation).toBe("submit-answer");
  }
});
```

- [ ] **Step 3: Run focused tests to verify red**

Run: `cd frontend && npm test -- --run src/core/copilot/copilotReducer.test.ts src/shared/copilot/react/CopilotRunProvider.test.tsx`

Expected: FAIL because `run-notice`, `notice` and retained HITL errors are unsupported; the resumed run is not subscribed after approval.

- [ ] **Step 4: Extend the event and run state contracts**

Add this event variant:

```ts
| {
    type: "run-notice";
    runId: string;
    sessionId: string;
    sequence: number;
    notice: string | null;
  }
```

Add `interactionError?: CopilotError` to both awaiting variants. Reducer must merge notice into `run.metadata.notice`, remove it for `null`, and clear it on terminal run status. `useCopilotRun()` returns:

```ts
const notice =
  state.status === "ready"
    ? null
    : typeof state.run.metadata?.notice === "string"
      ? state.run.metadata.notice
      : null;
```

- [ ] **Step 5: Fix HITL commands and recoverable subscriptions**

Both `submitApproval` and `submitAnswer` must follow this exact control flow:

```ts
try {
  const resumedRun = await transport.submitAnswer(awaiting.run.id, answer);
  setRunState(sessionId, { status: "streaming", run: resumedRun });
  subscribeToRun(resumedRun);
} catch (cause) {
  setRunState(sessionId, {
    ...awaiting,
    interactionError: toCopilotError("submit-answer", cause),
  });
}
```

Use `submitApproval` and `submit-approval` for the approval path. Add one reconnect timer ref. On recoverable observer errors, close the captured subscription and call `restoreRun(sessionId, revisionRef.current)` after 1000 ms; non-recoverable errors enter run error state. Clear the timer on session switch and unmount. Never create a reconnect timer for an awaiting HITL state.

- [ ] **Step 6: Map every QJudge stream callback**

In `qJudgeCopilotTransport.subscribeRun`, add:

```ts
onSessionNotice(notice) {
  emit({ type: "run-notice", notice });
},
onTodoItemsUpdate(items) {
  if (!items) return;
  emit({
    type: "part-upsert",
    messageId,
    part: { type: "data-todo-items", data: items },
  });
},
```

Keep the existing `data-verification` and `data-next-turn-options` mapping. Update historical message mapping from `data-todos` to `data-todo-items`, so live and reloaded sessions use the same discriminator.

- [ ] **Step 7: Add transport parity assertions**

Add this case to `qJudgeCopilotTransport.test.ts`:

```ts
it("normalizes live data parts and resumes from the requested sequence", async () => {
  let callbacks: StreamCallbacks | undefined;
  const subscribeRunEvents = vi.fn(
    async (_run: ChatRun, value: StreamCallbacks) => {
      callbacks = value;
    },
  );
  const repository = createRepository({ subscribeRunEvents });
  const transport = createQJudgeCopilotTransport(repository, vi.fn());
  const run = await transport.startRun({
    sessionId: legacySession.id,
    text: "Hi",
  });
  const events: CopilotRunEvent[] = [];

  transport.subscribeRun(
    run,
    {
      next: (event) => events.push(event),
      error: vi.fn(),
      complete: vi.fn(),
    },
    { fromSequence: 8 },
  );
  await vi.waitFor(() => expect(callbacks).toBeDefined());

  callbacks?.onSessionNotice?.("Summarizing");
  callbacks?.onTodoItemsUpdate?.([
    { id: "todo-1", label: "Check", status: "in_progress" },
  ]);
  callbacks?.onNextTurnOptions?.([
    { label: "Continue", message: "continue" },
  ]);
  callbacks?.onVerificationReport?.({
    iteration: 1,
    passed: true,
    issues: [],
    summary: "ok",
  });

  expect(subscribeRunEvents).toHaveBeenCalledWith(
    expect.objectContaining({ lastEventSeq: 8 }),
    expect.any(Object),
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(events).toMatchObject([
    { type: "run-notice", sequence: 9, notice: "Summarizing" },
    { type: "part-upsert", sequence: 10, part: { type: "data-todo-items" } },
    { type: "part-upsert", sequence: 11, part: { type: "data-next-turn-options" } },
    { type: "part-upsert", sequence: 12, part: { type: "data-verification" } },
  ]);
});
```

- [ ] **Step 8: Verify run lifecycle**

Run: `cd frontend && npm test -- --run src/core/copilot/copilotReducer.test.ts src/shared/copilot/react/CopilotRunProvider.test.tsx src/infrastructure/copilot/qJudgeCopilotTransport.test.ts`

Expected: all reducer, provider run and QJudge transport tests PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/core/copilot frontend/src/shared/copilot/react frontend/src/shared/copilot/hooks/useCopilotRun.ts frontend/src/infrastructure/copilot/qJudgeCopilotTransport.ts frontend/src/infrastructure/copilot/qJudgeCopilotTransport.test.ts
git commit -m "fix(copilot): preserve durable run interactions"
```

### Task 5: Make `CopilotPanel` a complete slot-based chat surface

**Files:**
- Modify: `frontend/src/shared/copilot/ui/copilotUI.types.ts`
- Modify: `frontend/src/shared/copilot/ui/CopilotPanel.tsx`
- Modify: `frontend/src/shared/copilot/ui/CopilotMessageList.tsx`
- Modify: `frontend/src/shared/copilot/ui/CopilotComposer.tsx`
- Modify: `frontend/src/shared/copilot/ui/CopilotUI.test.tsx`
- Modify: `frontend/src/shared/copilot/index.ts`

**Interfaces:**
- Produces: public `CopilotMessageListSlotProps`, `CopilotHistorySlotProps`, `CopilotSuggestionsProps` and expanded `CopilotUISlots`.
- Guarantees: QJudge can retain its visuals without replacing `CopilotPanel` orchestration or importing provider internals.

- [ ] **Step 1: Add failing slot orchestration tests**

Add `act` and `waitFor` to the Testing Library import, then add these cases to `CopilotUI.test.tsx`:

```tsx
it("renders history, list, suggestions and composer slots", async () => {
  const transport = new MemoryCopilotTransport();
  const session = await transport.createSession();
  const History = vi.fn(() => <div data-testid="history-slot" />);
  const List = vi.fn(() => <div data-testid="list-slot" />);
  const Suggestions = vi.fn(() => <div data-testid="suggestions-slot" />);
  const Composer = vi.fn(() => <div data-testid="composer-slot" />);

  render(
    <CopilotProvider transport={transport} initialSession="first">
      <CopilotPanel
        showHistory
        slots={{ history: History, messageList: List, suggestions: Suggestions, composer: Composer }}
      />
    </CopilotProvider>,
  );

  expect(await screen.findByTestId("history-slot")).toBeInTheDocument();
  expect(screen.getByTestId("list-slot")).toBeInTheDocument();
  expect(screen.getByTestId("composer-slot")).toBeInTheDocument();
  expect(History).toHaveBeenCalled();
  expect(List.mock.calls.at(-1)?.[0]).toEqual(
    expect.objectContaining({ activeSessionId: session.id }),
  );
});

it("shows next-turn suggestions only after the run is ready", async () => {
  const transport = new MemoryCopilotTransport();
  const session = await transport.createSession();
  const getSession = transport.getSession.bind(transport);
  vi.spyOn(transport, "getSession").mockImplementation(async (id) => ({
    ...(await getSession(id)),
    messages: [{
      id: "assistant-1",
      role: "assistant",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      parts: [{
        type: "data-next-turn-options",
        data: [
          { label: "Explain", message: "Explain more" },
          { label: "Continue", message: "Continue" },
        ],
      }],
    }],
  }));
  const run = await transport.startRun({ sessionId: session.id, text: "start" });
  const subscribe = vi.spyOn(transport, "subscribeRun");
  const Suggestions = vi.fn(() => <div data-testid="suggestions-slot" />);

  render(
    <CopilotProvider transport={transport} initialSession="first">
      <CopilotPanel slots={{ suggestions: Suggestions }} />
    </CopilotProvider>,
  );
  await waitFor(() => expect(subscribe).toHaveBeenCalled());
  expect(screen.queryByTestId("suggestions-slot")).not.toBeInTheDocument();

  act(() => {
    transport.emit(run.id, {
      type: "run-status",
      runId: run.id,
      sessionId: session.id,
      sequence: 1,
      status: "completed",
    });
  });

  expect(await screen.findByTestId("suggestions-slot")).toBeInTheDocument();
  expect(Suggestions.mock.calls.at(-1)?.[0].options).toEqual([
    { label: "Explain", message: "Explain more" },
    { label: "Continue", message: "Continue" },
  ]);
});
```

- [ ] **Step 2: Run UI test to verify red**

Run: `cd frontend && npm test -- --run src/shared/copilot/ui/CopilotUI.test.tsx`

Expected: FAIL because history, messageList and suggestions slots do not exist.

- [ ] **Step 3: Define complete slot props**

Add these public contracts to `copilotUI.types.ts`:

```ts
export interface CopilotHistorySlotProps {
  sessions: readonly CopilotSessionSummary[];
  activeSession: CopilotActiveSessionState;
  onSelect(id: string): void;
  onCreate(): void;
  onRename(id: string, title: string): void;
  onRemove(id: string): void;
}

export interface CopilotMessageListSlotProps {
  messages: readonly CopilotMessage[];
  activeSessionId: string | null;
  activeSession: CopilotActiveSessionState;
  run: CopilotRunState;
  messageComponent: ComponentType<CopilotMessageViewProps>;
}

export interface CopilotSuggestion {
  label: string;
  message: string;
}

export interface CopilotSuggestionsProps {
  options: readonly CopilotSuggestion[];
  disabled: boolean;
  onSelect(message: string): void;
}
```

Extend `CopilotUISlots` with `history`, `messageList` and `suggestions`. Export every new type from `@copilot`.

- [ ] **Step 4: Make panel orchestration use slots**

`CopilotPanel` must obtain `useCopilot()`, `useCopilotSessions()` and `useCopilotRun()`, select the latest valid `data-next-turn-options` from the latest assistant message, and render in this order: header, history/body layout, message list, approval/question/error, suggestions, composer. Suggestions call `copilot.send({ text: message })` and are hidden while submitted/streaming/awaiting interaction.

Use this validator instead of casting arbitrary data:

```ts
function isSuggestion(value: unknown): value is CopilotSuggestion {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.label === "string" && typeof candidate.message === "string";
}
```

Change `CopilotMessageList` to implement `CopilotMessageListSlotProps`; default `messageComponent` remains `CopilotMessageView`.

- [ ] **Step 5: Keep default composer model-aware**

`CopilotComposer` uses `useCopilotModels()` only to apply the selected model through provider-owned composer send. It must not render a model control when model status is `unavailable` or list is empty. Do not add Carbon to the default component.

- [ ] **Step 6: Verify public UI and shells**

Run: `cd frontend && npm test -- --run src/shared/copilot/ui/CopilotUI.test.tsx src/shared/copilot/ui/CopilotShells.test.tsx && npm run typecheck:copilot`

Expected: UI tests PASS, shell tests PASS, typecheck PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/shared/copilot/ui frontend/src/shared/copilot/index.ts
git commit -m "feat(copilot): expand panel slot contracts"
```

### Task 6: Finish QJudge transport and model adapters

**Files:**
- Create: `frontend/src/infrastructure/copilot/qJudgeCopilotModelCatalog.ts`
- Create: `frontend/src/infrastructure/copilot/qJudgeCopilotModelCatalog.test.ts`
- Create: `frontend/src/infrastructure/copilot/qJudgeCopilotDependencies.ts`
- Modify: `frontend/src/infrastructure/copilot/qJudgeCopilotTransport.ts`
- Modify: `frontend/src/infrastructure/copilot/qJudgeCopilotTransport.test.ts`
- Modify: `frontend/src/infrastructure/copilot/chatbotCopilotMapper.ts`
- Modify: `frontend/src/infrastructure/api/repositories/chatbot.repository.ts`
- Modify: `frontend/src/infrastructure/api/repositories/chatbot.repository.test.ts`
- Modify: `frontend/src/features/chatbot/adapters/qJudgeCopilotTranslations.ts`
- Modify: `frontend/src/features/chatbot/adapters/reactRouterCopilotSessionLocation.ts`

**Interfaces:**
- Produces: `QJudgeCopilotModelCatalog`, `QJUDGE_FALLBACK_MODELS`, `qJudgeCopilotTransport`, `qJudgeCopilotModelCatalog`, `qJudgeCopilotStorage`.
- Produces: session summaries enriched with `activeRunId` and `activeRunStatus` metadata.
- Changes: all Copilot imports in QJudge adapters use `@copilot`.

- [ ] **Step 1: Write failing model adapter tests**

Create `qJudgeCopilotModelCatalog.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { ChatbotRepository } from "@/core/ports/chatbot.repository";
import { QJudgeCopilotModelCatalog } from "./qJudgeCopilotModelCatalog";

describe("QJudgeCopilotModelCatalog", () => {
  it("maps repository models to product-neutral models", async () => {
    const repository = {
      getModels: vi.fn().mockResolvedValue([
        {
          model_id: "model-a",
          display_name: "Model A",
          description: "Fast",
          is_default: true,
        },
      ]),
    } as Pick<ChatbotRepository, "getModels">;
    const catalog = new QJudgeCopilotModelCatalog(repository);

    await expect(catalog.list()).resolves.toEqual([
      {
        id: "model-a",
        displayName: "Model A",
        description: "Fast",
        isDefault: true,
      },
    ]);
  });
});
```

- [ ] **Step 2: Run adapter test to verify red**

Run: `cd frontend && npm test -- --run src/infrastructure/copilot/qJudgeCopilotModelCatalog.test.ts`

Expected: FAIL because the catalog adapter does not exist.

- [ ] **Step 3: Implement model catalog and QJudge fallback data**

Create the adapter with constructor type `Pick<ChatbotRepository, "getModels">` and map `model_id → id`, `display_name → displayName`, `description → description`, and `is_default → isDefault`. Move the fallback data out of `useLegacyChatbotRuntime.ts` as this exact constant:

```ts
export const QJUDGE_FALLBACK_MODELS: readonly CopilotModel[] = [
  {
    id: "openai-nano",
    displayName: "gpt-5-nano",
    description: "快速且成本低，適合日常教學互動",
    isDefault: true,
  },
  {
    id: "openai-mini",
    displayName: "gpt-5.4-mini (low)",
    description: "OpenAI 推理模型，低思考強度，平衡速度與品質",
    isDefault: false,
  },
  {
    id: "openai-mini-medium",
    displayName: "gpt-5.4-mini (medium)",
    description: "OpenAI 推理模型，中等思考強度，適合複雜批改與推理",
    isDefault: false,
  },
  {
    id: "deepseek-v4",
    displayName: "deepseek-v4",
    description: "1M context、快速、低成本，適合日常對話與 summarization（非推理模式）",
    isDefault: false,
  },
  {
    id: "deepseek-v4-thinking",
    displayName: "deepseek-v4 (thinking)",
    description: "1M context、推理模式（reasoning_effort=low），適合複雜批改與測資生成",
    isDefault: false,
  },
];
```

- [ ] **Step 4: Enrich QJudge session summaries without background subscriptions**

Change `listSessions()` to fetch `getSessions()` and `getActiveRuns()` once in parallel, index runs by `sessionId`, and merge only metadata:

```ts
const [sessions, runs] = await Promise.all([
  repository.getSessions(),
  repository.getActiveRuns(),
]);
const runBySession = new Map(runs.map((run) => [run.sessionId, run]));
return sessions.map((session) => {
  const summary = mapChatSessionToCopilotSummary(session);
  const run = runBySession.get(session.id);
  return run
    ? {
        ...summary,
        metadata: {
          ...summary.metadata,
          activeRunId: run.id,
          activeRunStatus: mapChatRunStatusToCopilot(run.status),
        },
      }
    : summary;
});
```

Add this case to `qJudgeCopilotTransport.test.ts`:

```ts
it("enriches each session with its own active run without subscribing", async () => {
  const secondSession: ChatSession = {
    ...legacySession,
    id: "session-2",
    title: "Second",
  };
  const secondRun: ChatRun = {
    ...legacyRun,
    id: "run-2",
    sessionId: secondSession.id,
    status: "awaiting_user_answer",
  };
  const subscribeRunEvents = vi.fn().mockResolvedValue(undefined);
  const repository = createRepository({
    getSessions: vi.fn().mockResolvedValue([legacySession, secondSession]),
    getActiveRuns: vi.fn().mockResolvedValue([legacyRun, secondRun]),
    subscribeRunEvents,
  });

  const sessions = await createQJudgeCopilotTransport(
    repository,
    vi.fn(),
  ).listSessions();

  expect(sessions).toMatchObject([
    { id: "session-1", metadata: { activeRunId: "run-1", activeRunStatus: "running" } },
    { id: "session-2", metadata: { activeRunId: "run-2", activeRunStatus: "awaiting-answer" } },
  ]);
  expect(subscribeRunEvents).not.toHaveBeenCalled();
});
```

- [ ] **Step 5: Preserve HTTP classification for deep links**

In the chatbot repository request helper, keep the existing localized messages but attach `status` to the thrown error. Add `import { httpClient } from "@/infrastructure/api/http.client";` to `chatbot.repository.test.ts`, then add:

```ts
it.each([403, 404, 503])("preserves HTTP status %s on request errors", async (status) => {
  vi.spyOn(httpClient, "get").mockResolvedValueOnce(
    new Response(null, { status }),
  );

  await expect(chatbotRepository.getSession("missing")).rejects.toMatchObject({
    status,
  });
});
```

Update `mapQJudgeError` so status 404 maps to `not-found`, 401/403 maps to `forbidden`, and other errors remain `transport-error`. Add `mapQJudgeError` to the mapper import in `qJudgeCopilotTransport.test.ts`, then add:

```ts
it.each([
  [404, "not-found", false],
  [403, "forbidden", false],
  [503, "transport-error", true],
] as const)("maps HTTP %s to %s", (status, code, recoverable) => {
  const cause = Object.assign(new Error(`HTTP ${status}`), { status });

  expect(mapQJudgeError("load-session", cause)).toMatchObject({
    code,
    operation: "load-session",
    recoverable,
  });
});
```

- [ ] **Step 6: Create production dependency instances**

Create `qJudgeCopilotDependencies.ts`:

```ts
import { chatbotRepository } from "@/infrastructure/api/repositories";
import { uploadUserArtifact } from "@/infrastructure/api/repositories/artifact.repository";
import { BrowserCopilotStorage } from "./browserCopilotStorage";
import { createQJudgeCopilotTransport } from "./qJudgeCopilotTransport";
import {
  QJudgeCopilotModelCatalog,
  QJUDGE_FALLBACK_MODELS,
} from "./qJudgeCopilotModelCatalog";

export const qJudgeCopilotTransport = createQJudgeCopilotTransport(
  chatbotRepository,
  uploadUserArtifact,
);
export const qJudgeCopilotModelCatalog = new QJudgeCopilotModelCatalog(
  chatbotRepository,
);
export const qJudgeCopilotStorage = new BrowserCopilotStorage();
export { QJUDGE_FALLBACK_MODELS };
```

This is the only production file allowed to import the concrete chatbot repository for Copilot composition.

- [ ] **Step 7: Convert adapter imports to the public facade**

Replace `@/core/copilot`, `@/shared/copilot/...` imports in QJudge transport, location and translation adapters with `@copilot`. Tests import Memory utilities from `@copilot/testing`.

- [ ] **Step 8: Verify adapters**

Run: `cd frontend && npm test -- --run src/infrastructure/copilot src/infrastructure/api/repositories/chatbot.repository.test.ts src/features/chatbot/adapters/ReactRouterCopilotLocation.test.tsx src/features/chatbot/adapters/qJudgeCopilotTranslations.test.ts`

Expected: all QJudge transport/model/location/storage/translation tests PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/infrastructure/copilot frontend/src/infrastructure/api/repositories/chatbot.repository.ts frontend/src/infrastructure/api/repositories/chatbot.repository.test.ts frontend/src/features/chatbot/adapters/reactRouterCopilotSessionLocation.ts frontend/src/features/chatbot/adapters/qJudgeCopilotTranslations.ts
git commit -m "feat(chatbot): complete QJudge Copilot adapters"
```

### Task 7: Add the QJudge composition root behind the existing app

**Files:**
- Create: `frontend/src/features/chatbot/contexts/QJudgeCopilotProvider.tsx`
- Create: `frontend/src/features/chatbot/contexts/QJudgeCopilotProvider.test.tsx`
- Modify: `frontend/src/features/chatbot/index.ts`

**Interfaces:**
- Produces: `QJudgeCopilotBoundary` for dependency-injected integration tests.
- Produces: `QJudgeCopilotProvider` for production Auth/Router composition.
- Consumes: Task 2 model catalog, Task 3 `first-or-create`, Task 6 QJudge dependency instances.

- [ ] **Step 1: Write the failing composition test**

Create `QJudgeCopilotProvider.test.tsx`:

```tsx
import { renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it } from "vitest";
import {
  MemoryCopilotModelCatalog,
  MemoryCopilotSessionLocation,
  MemoryCopilotStorage,
  MemoryCopilotTransport,
} from "@copilot/testing";
import { useCopilotSessions } from "@copilot";
import { DefaultCopilotTranslations } from "@copilot";
import { QJudgeCopilotBoundary } from "./QJudgeCopilotProvider";

describe("QJudgeCopilotBoundary", () => {
  it("creates the first session through the injected Copilot runtime", async () => {
    const transport = new MemoryCopilotTransport();
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
    await waitFor(() => expect(result.current.activeSession.status).toBe("ready"));
    expect(result.current.sessions).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the composition test to verify red**

Run: `cd frontend && npm test -- --run src/features/chatbot/contexts/QJudgeCopilotProvider.test.tsx`

Expected: FAIL because `QJudgeCopilotBoundary` does not exist.

- [ ] **Step 3: Implement the dependency-injected boundary**

Create these exact props and nesting:

```tsx
export interface QJudgeCopilotBoundaryProps {
  enabled: boolean;
  transport: CopilotTransport;
  location: CopilotSessionLocation;
  storage: CopilotStorage;
  translations: CopilotTranslations;
  modelCatalog: CopilotModelCatalog;
  fallbackModels: readonly CopilotModel[];
  children: ReactNode;
}

export function QJudgeCopilotBoundary(props: QJudgeCopilotBoundaryProps) {
  return (
    <CopilotProvider
      enabled={props.enabled}
      transport={props.transport}
      sessionLocation={props.location}
      storage={props.storage}
      translations={props.translations}
      modelCatalog={props.modelCatalog}
      fallbackModels={props.fallbackModels}
      initialSession="first-or-create"
    >
      {props.children}
    </CopilotProvider>
  );
}
```

- [ ] **Step 4: Implement the production wrapper**

`QJudgeCopilotProvider` reads `user` from `useAuth()`, creates the Router location with `useReactRouterCopilotSessionLocation()`, memoizes `QJudgeCopilotTranslations`, and passes Task 6 instances into `QJudgeCopilotBoundary`. It must not import `chatbotRepository`, call a repository, manage URL effects, or store chat state.

- [ ] **Step 5: Export the composition root without mounting it yet**

Export `QJudgeCopilotProvider` and `QJudgeCopilotBoundary` from `features/chatbot/index.ts`. Keep `App.tsx` on `ChatbotProvider` until the atomic production cutover in Task 11; this commit must leave the running application on exactly one complete runtime.

- [ ] **Step 6: Verify composition**

Run: `cd frontend && npm test -- --run src/features/chatbot/contexts/QJudgeCopilotProvider.test.tsx src/shared/copilot/react/CopilotProvider.test.tsx && npm run build`

Expected: QJudge boundary test PASS, provider tests PASS, and the still-legacy production composition builds while migration continues.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/chatbot/contexts/QJudgeCopilotProvider.tsx frontend/src/features/chatbot/contexts/QJudgeCopilotProvider.test.tsx frontend/src/features/chatbot/index.ts
git commit -m "feat(chatbot): add QJudge Copilot composition"
```

### Task 8: Add Copilot data-part selectors and migrate session badges

**Files:**
- Create: `frontend/src/features/chatbot/adapters/qJudgeCopilotMessageData.ts`
- Create: `frontend/src/features/chatbot/adapters/qJudgeCopilotMessageData.test.ts`
- Modify: `frontend/src/features/chatbot/components/chat-ui/SessionBadges.tsx`
- Modify: `frontend/src/shared/ai/TodoList.tsx`

**Interfaces:**
- Produces: `selectLatestTodoItems(messages)`, `selectLatestNextTurnOptions(messages)`, `selectFinishedArtifactToolIds(messages)`.
- Changes: badges consume `CopilotMessage[]`; shared todo UI owns a product-neutral item contract.

- [ ] **Step 1: Write pure selector tests**

Create `qJudgeCopilotMessageData.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { CopilotMessage } from "@copilot";
import {
  selectFinishedArtifactToolIds,
  selectLatestNextTurnOptions,
  selectLatestTodoItems,
} from "./qJudgeCopilotMessageData";

const messages: CopilotMessage[] = [
  {
    id: "assistant-1",
    role: "assistant",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    parts: [
      { type: "data-todo-items", data: [{ id: "todo-1", label: "Grade", status: "in_progress" }] },
      { type: "data-next-turn-options", data: [{ label: "Continue", message: "continue" }] },
      { type: "tool", toolCallId: "tool-1", toolName: "artifact_write", state: "output-ready", output: {} },
    ],
  },
];

describe("QJudge Copilot message data", () => {
  it("selects typed data and completed artifact tools", () => {
    expect(selectLatestTodoItems(messages)).toEqual([
      { id: "todo-1", label: "Grade", status: "in_progress" },
    ]);
    expect(selectLatestNextTurnOptions(messages)).toEqual([
      { label: "Continue", message: "continue" },
    ]);
    expect(selectFinishedArtifactToolIds(messages)).toEqual(["tool-1"]);
  });

  it("ignores malformed data and unfinished tools", () => {
    const malformed: CopilotMessage[] = [{
      ...messages[0],
      parts: [
        { type: "data-todo-items", data: "invalid" },
        { type: "tool", toolCallId: "tool-2", toolName: "artifact_read", state: "input-ready" },
      ],
    }];
    expect(selectLatestTodoItems(malformed)).toEqual([]);
    expect(selectFinishedArtifactToolIds(malformed)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run selector tests to verify red**

Run: `cd frontend && npm test -- --run src/features/chatbot/adapters/qJudgeCopilotMessageData.test.ts`

Expected: FAIL because the selectors do not exist.

- [ ] **Step 3: Implement runtime validators and selectors**

Implement selectors by scanning assistant messages from newest to oldest and checking exact data-part discriminators. Accept todo statuses `pending`, `in_progress`, `success`, `fail`; accept next-turn entries only when both `label` and `message` are strings. Artifact tool IDs include `output-ready` and `error` states for names beginning with `artifact_`.

- [ ] **Step 4: Migrate badges and define a shared todo contract**

Add this type to `TodoList.tsx` and replace every `RunTodoItem` annotation in that file with it:

```ts
export type TodoListItemStatus = "pending" | "in_progress" | "success" | "fail";

export interface TodoListItem {
  id: string;
  label: string;
  status: TodoListItemStatus;
}
```

Change `SessionBadges` and `useSessionBadgeSummary` to accept `readonly CopilotMessage[]` and call `selectLatestTodoItems`. Type the QJudge selector result as `readonly TodoListItem[]` by importing the type from `@/shared/ai/TodoList`; this keeps the dependency direction feature → shared and prevents shared UI from importing a QJudge feature module.

- [ ] **Step 5: Verify data selectors and badges**

Run: `cd frontend && npm test -- --run src/features/chatbot/adapters/qJudgeCopilotMessageData.test.ts && npm run build`

Expected: selector tests PASS and the production build accepts the new badge/todo contracts.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/chatbot/adapters/qJudgeCopilotMessageData.ts frontend/src/features/chatbot/adapters/qJudgeCopilotMessageData.test.ts frontend/src/features/chatbot/components/chat-ui/SessionBadges.tsx frontend/src/shared/ai/TodoList.tsx
git commit -m "refactor(chatbot): derive badges from Copilot parts"
```

### Task 9: Convert QJudge message and HITL renderers to Copilot contracts

**Files:**
- Modify: `frontend/src/features/chatbot/components/chat-ui/ChainOfThought.tsx`
- Modify: `frontend/src/features/chatbot/components/chat-ui/MessageBubble.tsx`
- Modify: `frontend/src/features/chatbot/components/chat-ui/MessageList.tsx`
- Modify: `frontend/src/features/chatbot/components/chat-ui/HITLCard.tsx`
- Modify: `frontend/src/features/chatbot/components/chat-ui/QuestionCard.tsx`
- Modify: `frontend/src/features/chatbot/components/chat-ui/NextTurnChips.tsx`
- Modify: `frontend/src/features/chatbot/hooks/useChatScrollToBottom.ts`
- Modify: `frontend/src/features/chatbot/components/chat-ui/__stories__/chat-ui.mocks.ts`
- Modify: `frontend/src/features/chatbot/components/chat-ui/__stories__/MessageBubble.stories.tsx`
- Modify: `frontend/src/features/chatbot/components/chat-ui/__stories__/MessageList.stories.tsx`
- Create: `frontend/src/features/chatbot/components/chat-ui/MessageBubble.test.tsx`

**Interfaces:**
- `MessageBubble` implements public `CopilotMessageViewProps`.
- `MessageList` implements public `CopilotMessageListSlotProps`.
- `HITLCard` implements `CopilotApprovalCardProps`; `QuestionCard` implements `CopilotQuestionCardProps`.
- No file in this task imports `@/core/types/chatbot.types`.

- [ ] **Step 1: Write a failing Copilot-part renderer test**

Create `MessageBubble.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CopilotMessage } from "@copilot";
import { MessageBubble } from "./MessageBubble";

describe("MessageBubble", () => {
  it("renders text, reasoning and tool parts", () => {
    const message: CopilotMessage = {
      id: "assistant-1",
      role: "assistant",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      parts: [
        { type: "reasoning", text: "Checking", state: "complete" },
        { type: "tool", toolCallId: "tool-1", toolName: "lookup", state: "output-ready", input: { id: 1 }, output: "done" },
        { type: "text", text: "Answer" },
      ],
    };

    render(<MessageBubble message={message} />);

    expect(screen.getByText("Answer")).toBeInTheDocument();
    expect(screen.getByText("Checking")).toBeInTheDocument();
    expect(screen.getByText(/lookup/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run renderer test to verify red**

Run: `cd frontend && npm test -- --run src/features/chatbot/components/chat-ui/MessageBubble.test.tsx`

Expected: FAIL because `MessageBubble` still expects legacy `ChatMessage` fields.

- [ ] **Step 3: Convert `ChainOfThought` and `MessageBubble`**

Change `ChainOfThoughtProps.steps` to `readonly CopilotToolPart[]`. A step is done for `output-ready` or `error`, failed for `error`, reads input from `step.input`, output from `step.output`, and uses `step.toolCallId` as key.

In `MessageBubble`, derive values only from parts:

```ts
const text = message.parts
  .filter((part): part is CopilotTextPart => part.type === "text")
  .map((part) => part.text)
  .join("");
const reasoning = message.parts
  .filter((part): part is CopilotReasoningPart => part.type === "reasoning")
  .map((part) => part.text)
  .join("");
const tools = message.parts.filter(
  (part): part is CopilotToolPart => part.type === "tool",
);
const isThinking = message.role === "assistant" && message.parts.some(
  (part) => part.type === "reasoning" && part.state === "streaming",
);
```

Keep existing Markdown, copy button, reasoning details and ChainOfThought JSX. Remove legacy run-status rendering; `CopilotPanel` owns run-level status/error UI.

- [ ] **Step 4: Convert list and interaction cards**

`MessageList` receives `CopilotMessageListSlotProps`, renders `messageComponent`, shows skeleton when active session is loading, and calls `useCopilotScroll` from `@copilot` directly. Remove approval, question and next-turn props because `CopilotPanel` renders those siblings.

`HITLCard` reads `request.actions` and each action's `arguments`; only render decision buttons included by `request.allowedDecisions`. `QuestionCard` reads `request.input` instead of `inputType` and removes dismiss semantics from runtime state. `NextTurnChips` accepts `readonly CopilotSuggestion[]`.

- [ ] **Step 5: Update stories with Copilot fixtures**

Replace `ChatMessage`, `ApprovalRequest`, `QuestionRequest` and `NextTurnOption` fixtures with their public Copilot equivalents. Stories must import all Copilot types from `@copilot`.

- [ ] **Step 6: Verify renderers and Storybook compile**

Run: `cd frontend && npm test -- --run src/features/chatbot/components/chat-ui/MessageBubble.test.tsx src/shared/copilot/ui/CopilotUI.test.tsx && npm run build-storybook`

Expected: renderer tests PASS and Storybook static build PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/chatbot/components/chat-ui frontend/src/features/chatbot/hooks/useChatScrollToBottom.ts
git commit -m "refactor(chatbot): render Copilot message contracts"
```

### Task 10: Build QJudge slots and panel beside the legacy surface

**Files:**
- Create: `frontend/src/features/chatbot/components/chat-ui/qJudgeCopilotSlots.tsx`
- Create: `frontend/src/features/chatbot/components/chat-ui/QJudgeChatPanel.tsx`
- Create: `frontend/src/features/chatbot/components/chat-ui/QJudgeChatPanel.test.tsx`
- Modify: `frontend/src/features/chatbot/components/chat-ui/ComposerBar.tsx`
- Modify: `frontend/src/features/chatbot/components/chat-ui/ChatTopBar.tsx`
- Modify: `frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.tsx`
- Modify: `frontend/src/shared/ai/ModelSelect.tsx`

**Interfaces:**
- Produces: `QJudgeChatPanel({ mode, onClose, className })`.
- Produces: stable `qJudgeCopilotSlots` implementing every public slot contract.
- Guarantees: the new panel is complete and testable before Task 11 atomically changes the production provider and routes.

- [ ] **Step 1: Write the failing panel integration test**

Create `QJudgeChatPanel.test.tsx` using `MemoryCopilotTransport`, `MemoryCopilotModelCatalog`, `QJudgeCopilotBoundary`, and the current `ArtifactPanelProvider`. Import `ReactNode` as a type, create the session before render, and wrap the panel as:

```tsx
const renderPanel = (
  transport: MemoryCopilotTransport,
  sessionId: string,
  panel: ReactNode,
) => render(
  <QJudgeCopilotBoundary
    enabled
    transport={transport}
    location={new MemoryCopilotSessionLocation(sessionId)}
    storage={new MemoryCopilotStorage()}
    translations={new DefaultCopilotTranslations()}
    modelCatalog={new MemoryCopilotModelCatalog()}
    fallbackModels={[]}
  >
    <ArtifactPanelProvider sessionId={sessionId}>
      {panel}
    </ArtifactPanelProvider>
  </QJudgeCopilotBoundary>,
);
```

Add this full-mode case:

```tsx
it("sends a message through the full-page Copilot panel", async () => {
  const transport = new MemoryCopilotTransport();
  const session = await transport.createSession();
  renderPanel(
    transport,
    session.id,
    <QJudgeChatPanel mode="full" />,
  );

  const input = await screen.findByRole("textbox", { name: /message|輸入/i });
  expect(screen.getByRole("button", { name: /new|新增/i })).toBeInTheDocument();
  fireEvent.change(input, { target: { value: "你好" } });
  fireEvent.click(screen.getByRole("button", { name: /send|送出/i }));

  await waitFor(() =>
    expect(transport.getActiveRun(session.id)).resolves.not.toBeNull(),
  );
});
```

Add this sidebar-mode case:

```tsx
it("closes the sidebar through the header slot", async () => {
  const transport = new MemoryCopilotTransport();
  const session = await transport.createSession();
  const onClose = vi.fn();
  renderPanel(
    transport,
    session.id,
    <QJudgeChatPanel mode="sidebar" onClose={onClose} />,
  );

  fireEvent.click(await screen.findByRole("button", { name: /close|關閉/i }));

  expect(onClose).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the panel test to verify red**

Run: `cd frontend && npm test -- --run src/features/chatbot/components/chat-ui/QJudgeChatPanel.test.tsx`

Expected: FAIL because `QJudgeChatPanel` and QJudge slots do not exist.

- [ ] **Step 3: Make existing visual components implement slots**

Use public hooks only inside QJudge slots:

- Header slot calls `useCopilotSessions()` and passes summaries/actions to `ChatTopBar`.
- History slot calls the callbacks received in `CopilotHistorySlotProps` and renders `ChatHistoryPanel` with `CopilotSessionSummary[]`.
- Composer slot calls `useCopilotComposer()`, `useCopilotRun()`, `useCopilotModels()` and passes active session messages to `ComposerBar`.
- Approval/question/message/list/suggestions slots point to the Task 9 components.

Change `ComposerBar` to controlled Copilot state: `value`, `onValueChange`, `attachments`, `onAddAttachments`, `onRemoveAttachment`, `onSend(): Promise<boolean>`, `models: readonly CopilotModel[]`, and `selectedModelId: string | null`. Preserve its existing textarea resize, IME, upload picker, model select and layout JSX.

Change `ModelSelect` to product-neutral options:

```ts
export interface ModelSelectOption {
  id: string;
  label: string;
}

interface ModelSelectProps {
  models: readonly ModelSelectOption[];
  selectedModelId: string | null;
  onChange(modelId: string): void;
  disabled?: boolean;
  showStreamDot?: boolean;
  className?: string;
  menuPlacement?: "top" | "bottom";
  classes?: ModelSelectClasses;
}
```

QJudge composer maps `{ id: model.id, label: model.displayName }`; no `ModelInfo` remains in shared UI.

- [ ] **Step 4: Add a presentation-only QJudge panel context**

`QJudgeChatPanel` may store only `{ mode, onClose }` in a local presentation context for stable slot components. Inside the existing Artifact split/bottom-sheet layout, use `CopilotFullPageShell` for `mode="full"` and `CopilotEmbedShell` for `mode="sidebar"`; pass `qJudgeCopilotSlots` through each shell's `slots` prop. Do not pass `children` to either shell, because that bypasses its `CopilotPanel`. The panel must not call transport, repository, session URL, or maintain messages/run state.

- [ ] **Step 5: Verify the new panel without changing production composition**

Run: `cd frontend && npm test -- --run src/features/chatbot/components/chat-ui/QJudgeChatPanel.test.tsx src/shared/copilot/ui/CopilotShells.test.tsx && npm run build`

Expected: panel integration tests PASS, shell tests PASS, and the legacy production surface still builds until Task 11 performs the atomic cutover.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/chatbot/components/chat-ui frontend/src/shared/ai/ModelSelect.tsx
git commit -m "feat(chatbot): add QJudge Copilot panel slots"
```

### Task 11: Migrate non-chat QJudge consumers to public Copilot hooks

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/features/app/components/SideMenu.tsx`
- Modify: `frontend/src/features/app/components/SideMenu.test.tsx`
- Modify: `frontend/src/features/contest/screens/settings/ContestAiGradingScreen.tsx`
- Create: `frontend/src/features/contest/screens/settings/copilotGradingSelectors.ts`
- Create: `frontend/src/features/contest/screens/settings/copilotGradingSelectors.test.ts`
- Modify: `frontend/src/features/chatbot/contexts/ArtifactPanelContext.tsx`
- Create: `frontend/src/features/chatbot/contexts/ArtifactPanelContext.test.tsx`
- Modify: `frontend/src/features/chatbot/contexts/QJudgeCopilotProvider.tsx`
- Modify: `frontend/src/features/chatbot/components/chat-ui/QJudgeChatPanel.test.tsx`
- Modify: `frontend/src/features/chatbot/components/ChatFullPage.tsx`
- Modify: `frontend/src/features/chatbot/components/workspace/WorkspaceShell.tsx`

**Interfaces:**
- SideMenu consumes `useCopilotSessions()`; no optional runtime or repository fallback.
- Grading consumes `useCopilotSessions()`, `useCopilotModels()` and `useCopilotRun()`.
- Produces: pure background-run and todo selectors for grading.
- Guarantees: provider, full-page/workspace chat, Artifact integration and non-chat consumers switch to Copilot in one production commit.

- [ ] **Step 1: Write failing grading selector tests**

Create `copilotGradingSelectors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { CopilotSessionSummary } from "@copilot";
import { selectGradingSessionRun } from "./copilotGradingSelectors";

const session: CopilotSessionSummary = {
  id: "session-1",
  title: "Grading",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  metadata: {
    activeRunId: "run-1",
    activeRunStatus: "awaiting-answer",
  },
};

describe("selectGradingSessionRun", () => {
  it("reads background run metadata without a subscription", () => {
    expect(selectGradingSessionRun([session], session.id)).toEqual({
      id: "run-1",
      status: "awaiting-answer",
    });
  });

  it("returns null for malformed metadata", () => {
    expect(selectGradingSessionRun([{ ...session, metadata: {} }], session.id)).toBeNull();
  });
});
```

- [ ] **Step 2: Run selector and SideMenu tests to verify red**

Run: `cd frontend && npm test -- --run src/features/contest/screens/settings/copilotGradingSelectors.test.ts src/features/app/components/SideMenu.test.tsx`

Expected: selector suite FAILS because the helper is absent; SideMenu still mocks legacy contexts.

- [ ] **Step 3: Implement pure grading metadata selection**

Validate `activeRunId` as string and `activeRunStatus` against `CopilotRunStatus`. Return `{ id, status }` or null. Do not import legacy `ChatRun`.

- [ ] **Step 4: Convert SideMenu session actions**

Replace `useChatSessionContext`, `useOptionalChatbotContext`, `useAiSessionParam` and direct `chatbotRepository` with `useCopilotSessions()`. Use `activeSession.id` as the current session. Create, delete, rename and refresh call the hook commands.

Navigation remains QJudge-specific and explicit:

```ts
const goToChatSession = useCallback(
  (id: string, options?: { replace?: boolean }) => {
    const search = new URLSearchParams();
    search.set("ai_session_id", id);
    navigate({ pathname: "/chat", search: `?${search.toString()}` }, {
      replace: options?.replace ?? false,
    });
  },
  [navigate],
);
```

Update `SideMenu.test.tsx` to mock `@copilot` once with `useCopilotSessions`; delete legacy context and repository mocks. Keep navigation assertions.

- [ ] **Step 5: Convert Contest AI Grading**

Replace legacy contexts with:

```ts
const sessionRuntime = useCopilotSessions();
const modelRuntime = useCopilotModels();
const runRuntime = useCopilotRun();
const sessions = sessionRuntime.sessions;
const isLoadingSessions = sessionRuntime.listStatus === "loading";
const currentSession =
  sessionRuntime.activeSession.status === "ready"
    ? sessionRuntime.activeSession.data
    : null;
```

Use `model.id`／`model.displayName`; call `modelRuntime.select(modelId)`. Replace `createSession` with `sessionRuntime.create`, `refreshSessions` with `sessionRuntime.refresh`, and URL selection with `sessionRuntime.select`. For a background grading session, use `selectGradingSessionRun`; for the active session, use `runRuntime.state`. Derive todos with Task 8 selectors from `currentSession.messages`.

- [ ] **Step 6: Move Artifact refresh under the Copilot session owner**

Keep the existing Artifact UI state and repository calls, but replace `useOptionalChatbotContext()` with `useCopilotSessions()`. Derive both values from the discriminated active state:

```ts
const { activeSession } = useCopilotSessions();
const sessionId = activeSession.status === "ready" ? activeSession.id : null;
const messages =
  activeSession.status === "ready" ? activeSession.data.messages : [];
```

Replace the legacy `toolExecutions` scan with `selectFinishedArtifactToolIds(messages)`. Schedule a refresh only for IDs not present in `seenToolCallIds`. Keep `sessionId?: string | null` as a deprecated, ignored prop until `ChatbotProvider.tsx` is deleted in Task 12, so the unused legacy file still compiles in this atomic commit.

Inside `QJudgeCopilotBoundary`, nest the provider in this order so Artifact state can consume the public hook:

```tsx
<CopilotProvider {...copilotProps}>
  <ArtifactPanelProvider>{props.children}</ArtifactPanelProvider>
</CopilotProvider>
```

Update `QJudgeChatPanel.test.tsx`'s `renderPanel` helper by removing its manual `<ArtifactPanelProvider sessionId={sessionId}>` wrapper; `QJudgeCopilotBoundary` is now the single Artifact composition owner.

Create `ArtifactPanelContext.test.tsx`. Mock `listArtifacts`, seed a completed artifact part through the Memory transport's loaded session, and prove the debounced refresh fires:

```tsx
it("refreshes artifacts after a completed artifact tool part loads", async () => {
  vi.mocked(listArtifacts).mockResolvedValue([]);
  const transport = new MemoryCopilotTransport();
  const session = await transport.createSession();
  const getSession = transport.getSession.bind(transport);
  vi.spyOn(transport, "getSession").mockImplementation(async (id) => ({
    ...(await getSession(id)),
    messages: [{
      id: "assistant-1",
      role: "assistant",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      parts: [{
        type: "tool",
        toolCallId: "artifact-tool-1",
        toolName: "artifact_write",
        state: "output-ready",
        output: { ok: true },
      }],
    }],
  }));
  const wrapper = ({ children }: PropsWithChildren) => (
    <QJudgeCopilotBoundary
      enabled
      transport={transport}
      location={new MemoryCopilotSessionLocation(session.id)}
      storage={new MemoryCopilotStorage()}
      translations={new DefaultCopilotTranslations()}
      modelCatalog={new MemoryCopilotModelCatalog()}
      fallbackModels={[]}
    >
      {children}
    </QJudgeCopilotBoundary>
  );

  renderHook(() => useArtifactPanel(), { wrapper });

  await waitFor(() => {
    expect(listArtifacts).toHaveBeenCalledTimes(2);
  }, { timeout: 1_000 });
  expect(listArtifacts).toHaveBeenLastCalledWith({ sessionId: session.id });
});
```

At the top of that test file, declare the module mock before importing the provider:

```ts
vi.mock("@/infrastructure/api/repositories/artifact.repository", () => ({
  listArtifacts: vi.fn(),
}));
```

- [ ] **Step 7: Atomically cut production to the new provider and panel**

In `App.tsx`, replace the `ChatbotProvider` import and JSX with `QJudgeCopilotProvider`; do not mount both. Change `ChatFullPage` to:

```tsx
export default function ChatFullPage() {
  return <QJudgeChatPanel mode="full" className={styles.fullPage} />;
}
```

In QJudge workspace chrome, remove `<CopilotWorkspaceShell disabled>`. Replace both desktop and mobile `<ChatContainer mode="sidebar" ... />` calls with:

```tsx
<QJudgeChatPanel mode="sidebar" onClose={right.close} />
```

`QJudgeChatPanel` itself already routes through `CopilotFullPageShell`／`CopilotEmbedShell` and their internal `CopilotPanel`; the route components must not pass shell children that bypass orchestration.

- [ ] **Step 8: Verify the atomic QJudge cutover**

Run: `cd frontend && npm test -- --run src/features/app/components/SideMenu.test.tsx src/features/contest/screens/settings/copilotGradingSelectors.test.ts src/features/chatbot/contexts/ArtifactPanelContext.test.tsx src/features/chatbot/components/chat-ui/QJudgeChatPanel.test.tsx && npm run build`

Expected: consumer, Artifact and panel tests PASS; production builds with only `QJudgeCopilotProvider` mounted and every chat surface using `QJudgeChatPanel`.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/App.tsx frontend/src/features/app/components/SideMenu.tsx frontend/src/features/app/components/SideMenu.test.tsx frontend/src/features/contest/screens/settings/ContestAiGradingScreen.tsx frontend/src/features/contest/screens/settings/copilotGradingSelectors.ts frontend/src/features/contest/screens/settings/copilotGradingSelectors.test.ts frontend/src/features/chatbot/contexts/ArtifactPanelContext.tsx frontend/src/features/chatbot/contexts/ArtifactPanelContext.test.tsx frontend/src/features/chatbot/contexts/QJudgeCopilotProvider.tsx frontend/src/features/chatbot/components/chat-ui/QJudgeChatPanel.test.tsx frontend/src/features/chatbot/components/ChatFullPage.tsx frontend/src/features/chatbot/components/workspace/WorkspaceShell.tsx
git commit -m "refactor(copilot): cut QJudge over to public runtime"
```

### Task 12: Delete the legacy runtime and contexts

**Files:**
- Delete: `frontend/src/features/chatbot/adapters/useLegacyChatbotRuntime.ts`
- Delete: `frontend/src/features/chatbot/adapters/legacyChatbotMapper.ts`
- Delete: `frontend/src/features/chatbot/hooks/useChatbot.ts`
- Delete: `frontend/src/features/chatbot/hooks/useChatbot.test.ts`
- Delete: `frontend/src/features/chatbot/hooks/useChatbotSessionLifecycle.test.ts`
- Delete: `frontend/src/features/chatbot/hooks/useChatbotRunLifecycle.test.ts`
- Delete: `frontend/src/features/chatbot/contexts/ChatbotProvider.tsx`
- Delete: `frontend/src/features/chatbot/contexts/ChatSessionContext.tsx`
- Delete: `frontend/src/features/chatbot/lib/chatbotLegacyMerge.ts`
- Delete: `frontend/src/features/chatbot/lib/aiSessionUrl.ts`
- Delete: `frontend/src/features/chatbot/components/chat-ui/ChatContainer.tsx`
- Modify: `frontend/src/features/chatbot/index.ts`
- Modify: `frontend/src/features/chatbot/components/ChatStandalonePage.tsx`
- Modify: `frontend/package.json`

**Interfaces:**
- Removes: every `useChatbot*`, legacy chatbot context and legacy merge surface.
- Keeps: legacy repository types only where the QJudge repository/mapper still needs them.

- [ ] **Step 1: Prove all production consumers are gone before deletion**

Run:

```bash
cd frontend
rg -n 'useLegacyChatbotRuntime|useChatbot(Context)?|useOptionalChatbotContext|useChatSessionContext|applyRunMessageUpdate|useAiSessionParam' src --glob '*.{ts,tsx}'
```

Expected: matches only inside the files listed for deletion and their legacy tests. Any match elsewhere blocks this task and must be migrated in Task 8–11 before continuing. `ChatContainer.tsx` may be found only by its filename/import search and must have no production importer after Task 11.

- [ ] **Step 2: Delete the legacy files and exports**

Remove all eleven files listed above. Remove `useChatSessionContext` and any `ChatContainer` export from `features/chatbot/index.ts`. Update `ChatStandalonePage` comment so it states URL ownership belongs to `CopilotSessionLocation`; it must not mention `ChatbotProvider`.

- [ ] **Step 3: Narrow the Copilot test script**

Change `test:copilot` to run only candidate and adapter roots that still exist:

```json
"test:copilot": "vitest run src/core/copilot src/shared/copilot src/infrastructure/copilot src/features/chatbot/adapters src/features/chatbot/contexts/QJudgeCopilotProvider.test.tsx src/features/chatbot/components/chat-ui/QJudgeChatPanel.test.tsx"
```

- [ ] **Step 4: Verify deleted symbols and compile**

Run:

```bash
cd frontend
if rg -n 'useLegacyChatbotRuntime|useChatbotContext|useOptionalChatbotContext|useChatSessionContext|function useChatbot\b' src --glob '*.{ts,tsx}'; then exit 1; fi
npm run typecheck:copilot
npm run test:copilot
npm run build
```

Expected: `rg` produces no output, typecheck PASS, Copilot tests PASS, production build PASS.

- [ ] **Step 5: Commit**

```bash
git add -A frontend/src/features/chatbot frontend/package.json
git commit -m "refactor(chatbot): remove legacy runtime surfaces"
```

### Task 13: Enforce dogfood boundaries and complete regression coverage

**Files:**
- Create: `frontend/scripts/check-copilot-dogfood-boundary.js`
- Create: `frontend/src/test/architecture/copilotDogfoodBoundary.test.ts`
- Modify: `frontend/scripts/check-copilot-package-boundary.js`
- Modify: `frontend/package.json`
- Modify: `frontend/type-tests/copilot.public-api.typecheck.ts`
- Modify: `frontend/src/shared/copilot/copilotPublicApi.test.ts`
- Modify: `frontend/examples/copilot-minimal/App.tsx`
- Modify: `frontend/examples/copilot-minimal/README.md`

**Interfaces:**
- Produces: `npm run check:copilot-dogfood`.
- Gate rules: public aliases only, no testing imports in production, no candidate product imports, no repository imports outside approved infrastructure adapters, no legacy runtime symbols.

- [ ] **Step 1: Write a failing dogfood gate test**

Create `copilotDogfoodBoundary.test.ts`:

```ts
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Copilot dogfood boundary", () => {
  it("accepts the real frontend source tree", () => {
    const output = execFileSync(
      process.execPath,
      [resolve(process.cwd(), "scripts/check-copilot-dogfood-boundary.js")],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    expect(output).toContain("Copilot dogfood boundary passed");
  });
});
```

- [ ] **Step 2: Run the gate test to verify red**

Run: `cd frontend && npm test -- --run src/test/architecture/copilotDogfoodBoundary.test.ts`

Expected: FAIL with `MODULE_NOT_FOUND` for the new script.

- [ ] **Step 3: Implement the dogfood source scanner**

The script recursively scans `.ts`/`.tsx` under `src`, ignoring tests when applying production-only rules. It must report and exit 1 for:

```js
const blockedCopilotImports = [
  "@/core/copilot",
  "@/shared/copilot",
];
const blockedLegacySymbols = [
  "useLegacyChatbotRuntime",
  "useChatbotContext",
  "useOptionalChatbotContext",
  "useChatSessionContext",
];
```

Rules:

- Any QJudge file importing a specifier beginning with a blocked Copilot import fails; candidate files under `core/copilot` and `shared/copilot` are exempt from this consumer rule.
- `@copilot/testing` in a non-test production file fails.
- `chatbot.repository` or the repositories barrel in Copilot-related production files is allowed only under `src/infrastructure/copilot`.
- Any blocked legacy symbol in production source fails.
- `useChatbot` fails only as an imported/called identifier; words in historical docs are outside the scanned roots.

Sort violations before printing so CI output is deterministic. Success prints the number of scanned files.

- [ ] **Step 4: Extend candidate purity roots and public API assertions**

Set `check-copilot-package-boundary.js` candidate roots to exactly `src/core/copilot` and `src/shared/copilot`. `src/infrastructure/copilot` remains QJudge integration code—even generic browser adapters are excluded from the current package candidate until a later extraction explicitly promotes them. Ensure the QJudge transport, model catalog and dependency instances are never scanned as package candidate.

Update type/runtime API tests to require `useCopilotModels`, `CopilotPanel`, all slot types, model types and ports. Assert all Memory adapters remain absent from the main runtime namespace. Update the example README to use `@copilot/testing` and state that QJudge is the production dogfood consumer.

- [ ] **Step 5: Add scripts and run architecture gates**

Add:

```json
"check:copilot-dogfood": "node scripts/check-copilot-dogfood-boundary.js"
```

Run:

```bash
cd frontend
npm test -- --run src/test/architecture/copilotDogfoodBoundary.test.ts src/shared/copilot/copilotPublicApi.test.ts
npm run check:copilot-boundary
npm run check:copilot-dogfood
npm run typecheck:copilot
node ../.codex/skills/qjudge-quality-gates-owner/scripts/lint-architecture.js --root src --policy compat
```

Expected: both focused tests PASS; package boundary, dogfood boundary, typecheck and compat architecture lint PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/scripts frontend/src/test/architecture/copilotDogfoodBoundary.test.ts frontend/package.json frontend/type-tests/copilot.public-api.typecheck.ts frontend/src/shared/copilot/copilotPublicApi.test.ts frontend/examples/copilot-minimal
git commit -m "chore(copilot): enforce QJudge dogfood boundaries"
```

## Final Verification: Quality and browser acceptance

Do not create package metadata or publishing files during verification. If a gate exposes a regression, return to the task that owns the behavior, add a focused failing test there, implement the correction, commit it with that task's scope, then restart this section from Step 1.

- [ ] **Step 1: Run the complete frontend automated gate**

Run from the repository root with the dev frontend container mounted to this worktree:

```bash
docker run --rm \
  --volumes-from oj_frontend_dev \
  -v "$PWD/backend:/backend" \
  -w /app online_judge-frontend npm run test
```

Expected: all frontend test files PASS; only explicitly existing skipped tests may remain skipped.

- [ ] **Step 2: Run build, type and package-candidate gates**

Run:

```bash
cd frontend
npm run typecheck:copilot
npm run check:copilot-boundary
npm run check:copilot-dogfood
npm run build:copilot-example
npm run build
npm run build-storybook
```

Expected: all six commands exit 0. Existing Vite chunk-size and Sass deprecation warnings are non-blocking; new errors are blocking.

- [ ] **Step 3: Run naming and architecture policy checks**

Run from repository root:

```bash
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-architecture.js --root frontend/src --policy compat
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-naming.js --root frontend/src
```

Expected: architecture PASS. If naming reports historical repository violations, save the exact output and verify none of the files added or modified by this plan appears in the violation list.

- [ ] **Step 4: Recreate the local frontend from this branch**

Run from repository root:

```bash
COMPOSE_PROJECT_NAME=online_judge .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d --no-build --force-recreate --no-deps frontend
```

Expected: `oj_frontend_dev` is running and `/app` is mounted from the current worktree. Verify with:

```bash
docker inspect oj_frontend_dev --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}'
```

- [ ] **Step 5: Perform browser acceptance on all surfaces**

Using the local/dev URL and an authenticated test user, perform these exact checks:

1. Open `/chat?ai_session_id=<existing-session-id>`; the specified session loads without URL oscillation.
2. Send `你好`; one user message and one streaming assistant response appear.
3. Reload while a run is active; the run resumes from its stored sequence without duplicate text/tool cards.
4. Trigger Ask User, leave it unanswered for at least two minutes, reload, answer it, and confirm the same run resumes.
5. Trigger approval, approve/reject once, and confirm only one resumed subscription is active.
6. Attach a file, send it, and confirm attachment state and Artifact Panel refresh.
7. Stop a running response and confirm backend cancellation plus terminal UI state.
8. Verify full-page `/chat`, desktop workspace side panel, and mobile/embed sheet.
9. Confirm composer remains visible, message list scrolls, and the page has no trapped or double vertical scrollbar.
10. Open a grading task session and confirm session auto-bind, model selection, background run badge and todo progress still work.

Expected: all ten checks pass with no console uncaught promise rejection and no duplicate SSE requests for the active run.

- [ ] **Step 6: Verify final repository state**

Run:

```bash
git status --short
git diff dev...HEAD --stat
git log --oneline dev..HEAD
```

Expected: only the user's two known untracked AI grading files remain outside commits; implementation commits are focused and no npm package/publishing files were added.

---

## Final Success Checklist

- [ ] QJudge production mounts `CopilotProvider` through `QJudgeCopilotProvider`.
- [ ] QJudge chat surface uses `CopilotPanel`, public shells and QJudge slots.
- [ ] SideMenu and Contest AI Grading consume public `useCopilot*` hooks.
- [ ] `useLegacyChatbotRuntime`, `useChatbot`, legacy chatbot contexts and legacy merge helpers are deleted.
- [ ] `currentSessionId`／`currentSession`／status are represented only by `CopilotActiveSessionState`.
- [ ] Model catalog, selection and persistence are owned by `CopilotProvider`.
- [ ] Ask User and approval survive wait, reload, submit failure and resume.
- [ ] Session notice, todo items, next-turn options and verification parts have live/reload parity.
- [ ] URL deep link, unknown-list session and `first-or-create` behavior pass.
- [ ] Artifact upload/panel and grading background-session behavior pass.
- [ ] QJudge imports Copilot only through `@copilot`; tests use `@copilot/testing`.
- [ ] Package candidate imports no QJudge feature, repository, Router, i18next or Carbon code.
- [ ] Full tests, builds, typecheck, boundary gates and browser acceptance pass.
- [ ] No npm package or publishing configuration was created.
