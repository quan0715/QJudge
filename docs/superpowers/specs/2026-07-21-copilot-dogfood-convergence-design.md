# Copilot Dogfood 與 Legacy 收斂設計

日期：2026-07-21
狀態：已完成對話式設計確認，等待書面審閱

## 1. 目標

把 QJudge 前端聊天功能改成 Copilot 模組的第一個正式 consumer。QJudge production path 必須使用與未來外部產品相同的公開 provider、hooks、types、ports 與 UI shells，不得因為程式碼位於同一個 repository 而依賴 Copilot 內部實作。

本階段只整理專案內模組邊界，不建立、不發布 npm package。完成後的原始碼應可作為 package candidate，未來抽離時不需要重新設計 runtime ownership。

本文件延伸 `2026-07-13-copilot-package-design.md`，並取代其中「第一階段保留 `useChatbot`」的 legacy migration 決策。原規格的公開 types、ports、hooks 與 shells 方向繼續有效；若兩份文件對 legacy 最終狀態有衝突，以本文件為準。

使用者可見行為必須維持不變，包括：

- `ai_session_id` deep link 與 reload 恢復
- full page、workspace、embed 三種聊天呈現
- session 建立、切換、重新命名與刪除
- 訊息串流、停止生成與斷線恢復
- Ask User、approval 與恢復執行
- 動態模型選擇與 fallback
- 附件上傳、Artifact Panel 與產品特化卡片
- composer 位置、頁面捲動與既有視覺行為

## 2. 核心決策

1. `CopilotProvider` 是唯一的 session、run、composer 與 subscription runtime owner。
2. QJudge production chat surface 使用公開 `CopilotPanel`／shells；必要的產品整合直接使用 `useCopilot*`，不保留 `useChatbot` 相容 facade。
3. 現有 `ChatbotProvider` 收斂並改名為 `QJudgeCopilotProvider`，只作為 QJudge composition root；它不屬於未來 npm package。
4. QJudge 只能經由 `@copilot` 公開入口使用 package candidate；測試工具只能經由 `@copilot/testing` 使用。
5. QJudge API、React Router、i18next、Auth 與 Artifact 實作只能存在於 QJudge adapters／composition，不得反向進入 Copilot candidate。
6. 遷移期間不在 production 同時掛載 legacy 與 Copilot runtime，避免雙重 session state 與 SSE subscription。

## 3. 範圍

### 3.1 本階段包含

- 補齊 Copilot runtime 支援 QJudge 現有行為所缺少的通用能力。
- 將 QJudge Chat UI 改成使用公開 `CopilotPanel`／shells／slots；必要的產品整合直接消費 `useCopilot*`。
- 將 session URL、storage、SSE、HITL、attachments 與 models 的 ownership 移到 provider／ports。
- 將 QJudge 特化限制在 transport、location、translations、model catalog、renderers 與 Artifact integration。
- 移除 legacy runtime、contexts、mappers 與失去 consumer 的 types。
- 補齊 contract、integration、architecture 與 browser smoke tests。

### 3.2 本階段不包含

- 建立 npm workspace package、`package.json` exports 或發布流程。
- 發布到 npm registry。
- 重新設計聊天視覺或改變使用者操作流程。
- 修改 backend／ai-service API contract；若前端 adapter 發現契約缺口，另開設計處理。
- 把 Artifact Panel、grading cards 或 QJudge Auth 放進通用 Copilot candidate。

## 4. 邊界與依賴方向

```text
QJudge App
└── QJudgeCopilotProvider                 # QJudge composition root
    ├── Auth enabled state                # QJudge-only
    ├── QJudgeCopilotTransport            # infrastructure adapter
    ├── ReactRouterCopilotLocation         # product/router adapter
    ├── BrowserCopilotStorage              # infrastructure adapter
    ├── QJudgeCopilotTranslations          # product/i18n adapter
    ├── QJudgeCopilotModelCatalog          # infrastructure adapter
    └── CopilotProvider                    # package candidate runtime
        ├── useCopilotSessions
        ├── useCopilotRun
        ├── useCopilotComposer
        ├── useCopilotModels
        └── Copilot UI / shells
```

允許的依賴方向：

```text
QJudge features ──> @copilot public API
QJudge composition ──> QJudge adapters + @copilot public API
QJudge infrastructure adapters ──> QJudge repositories + @copilot public types
Copilot UI/runtime ──> Copilot core ports/types
Copilot core ──> Copilot core
```

禁止的依賴方向：

- Copilot candidate → `features/`
- Copilot candidate → QJudge repository、Router、i18next、Auth、Artifact Panel
- QJudge consumer → Copilot 內部檔案或 deep import
- QJudge feature runtime → chatbot repository
- `shared/copilot` → QJudge product adapter

## 5. 公開入口

在尚未建立 npm package 前，以 alias 模擬未來 package exports：

- `@copilot`：production public API
- `@copilot/testing`：Memory adapters 與 transport contract test utilities

`@copilot` 公開：

- `CopilotProvider`
- `useCopilot()`
- `useCopilotSessions()`
- `useCopilotRun()`
- `useCopilotComposer()`
- `useCopilotModels()`
- `useCopilotScroll()`
- `useCopilotSessionLocation()`
- Copilot state、message、session、run、model、error 與 port types
- `CopilotInitialSessionStrategy`
- `CopilotWorkspaceShell`
- `CopilotFullPageShell`
- `CopilotEmbedShell`
- `CopilotPanel`
- 通用聊天 UI components、`CopilotUISlots` 與 renderer contracts

`@copilot/testing` 公開：

- `MemoryCopilotTransport`
- `MemoryCopilotSessionLocation`
- `MemoryCopilotStorage`
- `MemoryCopilotModelCatalog`
- transport contract test utilities

Testing subpath 不得被 `@copilot` 主入口重新匯出。

目前路徑 ownership 固定如下：

| 路徑 | Ownership | 未來 package candidate |
| --- | --- | --- |
| `frontend/src/core/copilot` | 純 types、ports、events、reducer、selectors | 是 |
| `frontend/src/shared/copilot` | public entry、React provider、hooks、UI、default translations、testing subpath | 是；testing 只走獨立 export |
| `frontend/src/infrastructure/copilot` | QJudge transport、browser location/storage、model catalog implementations | 否 |
| `frontend/src/features/chatbot` | QJudge composition、slots、renderers、Artifact integration | 否 |

`@copilot` 在 repository 內雖映射到 public source entry，architecture gate 必須把它視為外部 package facade。QJudge adapters 與 features 都只能經此 facade 取得 Copilot contracts，不得依實體檔案位置繞過邊界。

## 6. Provider、Hooks 與 QJudge Composition 的職責

### 6.1 `CopilotProvider`

`CopilotProvider` 是通用 runtime 與唯一狀態 owner，負責：

- 初始化 session list 與 active session
- session create、select、rename、remove、refresh
- active session 詳情載入
- run start、subscribe、resume、cancel、retry
- SSE sequence 與 stale response 防護
- HITL approval／question state
- composer draft、attachments 與 selected model
- 透過 ports 存取 transport、location、storage、translations 與 model catalog
- 將錯誤正規化成 `CopilotError`

它不得知道 QJudge repository、URL query 名稱、model ID、翻譯 namespace 或 Artifact UI。

### 6.2 `useCopilot*`

Hooks 是 provider context 的 consumer API。它們只讀取 provider state 並呼叫 provider commands，不保存第二份 runtime state，也不直接執行 I/O。

- `useCopilotSessions()`：session list、active session 與 session commands
- `useCopilotRun()`：run state、HITL、stop 與 retry
- `useCopilotComposer()`：draft、pending attachments、canSend 與 composer send/reset
- `useCopilotModels()`：model list、載入狀態、選擇與 refresh
- `useCopilot()`：常用 aggregate read model 與明確輸入的 `send()` command

### 6.3 `QJudgeCopilotProvider`

`QJudgeCopilotProvider` 留在 QJudge feature composition 層，預期保持為薄 wrapper，只負責：

- 取得登入狀態並設定 `enabled`
- 建立或取得穩定的 QJudge adapters
- 將 adapters 注入 `CopilotProvider`
- 在 `CopilotProvider` 內掛載 QJudge `ArtifactPanelProvider`
- 提供 children

它不得保存 session/run/messages，不得包含 URL 鏡像 effect，不得訂閱 SSE，也不得直接呼叫 repository。

## 7. Ports 的用途

Port 是 runtime 對外部世界需求的介面。Copilot 只定義「需要什麼能力」，不決定「QJudge 如何完成」。因此：

- production 可注入 QJudge HTTP／Router／browser 實作；
- tests 可注入 Memory 實作；
- 未來其他產品可注入自己的 backend 與框架；
- Copilot runtime 不需要 import 任何產品程式碼。

### 7.1 `CopilotTransport`

提供 session、run、subscription、cancel、approval、answer 與 attachment I/O。QJudge 的實作負責把既有 chatbot repository types 映射成 Copilot types。

### 7.2 `CopilotSessionLocation`

提供 `get()`、`set()` 與 `subscribe()`。QJudge adapter 將它映射到 `ai_session_id` search param；Copilot runtime 不知道 React Router。

### 7.3 `CopilotStorage`

保存上次 session 等非敏感偏好。browser adapter 可使用 localStorage；tests 使用 memory storage。

### 7.4 `CopilotTranslations`

將通用錯誤／UI key 轉為文字。default implementation 不依賴 i18next；QJudge adapter 可使用既有翻譯資源。

### 7.5 `CopilotModelCatalog`

這是獨立且可選的 port，不塞入 chat transport。它提供動態 model list；`CopilotProvider` 保存 model list、status 與 selection。

公開契約採用產品中立命名：

```ts
export interface CopilotModel {
  id: string;
  displayName: string;
  description?: string;
  isDefault?: boolean;
  metadata?: Record<string, unknown>;
}

export interface CopilotModelCatalog {
  list(options?: CopilotRequestOptions): Promise<readonly CopilotModel[]>;
}

export interface UseCopilotModelsResult {
  models: readonly CopilotModel[];
  status: "idle" | "loading" | "ready" | "error" | "unavailable";
  selectedModelId: string | null;
  error: CopilotError | null;
  select(id: string | null): void;
  refresh(): Promise<void>;
}
```

`CopilotError.operation` 增加 `load-models`，讓 catalog failure 使用同一套錯誤模型。QJudge 可注入自己的 fallback models。通用 candidate 不得包含 `openai-nano` 或其他 QJudge model ID。catalog 失敗時仍允許使用 fallback model 聊天。

## 8. State Model

### 8.1 Active session

`currentSessionId`、`currentSession` 與 session loading/error 不再是平行欄位，統一使用 `CopilotActiveSessionState` discriminated union。至少涵蓋：

- `empty`
- `loading`，含目標 session ID
- `ready`，含完整 session
- `error`，含目標 session ID 與 `CopilotError`

Consumer 必須依 `status` narrowing，不得組合出「ready 但 session 為 null」等非法狀態。

### 8.2 Run

`CopilotRunState` 是 run、streaming 與 HITL 的唯一事實來源，至少涵蓋：

- `ready`
- `submitted`
- `streaming`
- `awaiting-approval`
- `awaiting-answer`
- `error`

Question／approval request 必須存在於對應 union variant，不另設 `pendingQuestion` 或 `pendingApproval` state。

### 8.3 Composer 與 models

Composer 保存 draft 與 pending attachments。Model selection 由 provider 的 model state 保存，並透過 `CopilotStorage` 保存最後有效 model ID。Catalog 載入後若 stored model 已不存在，改選 catalog default，再 fallback 到第一個 model。`useCopilotComposer().send()` 自動使用目前 model；`useCopilot().send(input)` 允許 `modelId` 明確覆寫。

`CopilotProvider` 接受可選的 `modelCatalog` 與 `fallbackModels`。沒有 catalog 時 model status 為 `unavailable`，但文字聊天仍可運作。QJudge 使用的 session 初始化值為公開的 `first-or-create` strategy；其他既有 strategy 保持相容。

## 9. 資料流

### 9.1 初始化與 session 選擇

QJudge 使用的初始化策略固定為：

1. `CopilotSessionLocation` 的 session ID
2. `CopilotStorage` 保存且仍有效的 session ID
3. session list 第一筆
4. list 為空時建立新 session

為表達這個行為，provider 增加明確的 `first-or-create` 初始化策略，避免 QJudge composition 自己補 lifecycle effect。

URL 指向 session list 外的 ID 時，provider 必須先嘗試 `transport.getSession(id)`。成功便加入本地 summary 並選取；只有確定不存在或無權存取時才清除 location 並套用 fallback 策略。這涵蓋 AI Task 在其他頁面建立 session 後直接導向聊天頁的情境。

選取 session 完成後，provider 呼叫 `getActiveRun(sessionId)`；若 run 尚未結束，依 `lastSequence` 恢復唯一 subscription。

QJudge transport 的 `listSessions()` 需以既有 active-runs endpoint 補上各 session summary 的 active run metadata，保留 history 對背景任務狀態的辨識；provider 不為每個背景 session 建立 subscription。

### 9.2 URL ownership

Session URL 完全由 `CopilotSessionLocation` 與 provider 管理。QJudge Chat UI 選取 session 時只呼叫 `useCopilotSessions().select(id)`，不得直接呼叫 `useAiSessionParam()`。

這會移除目前 provider 與 component 兩邊各自同步 URL 的雙向 ownership。

### 9.3 送訊息

QJudge composer 呼叫 `useCopilot().send({ text, attachments, modelId })` 或 `useCopilotComposer().send()`：

1. provider 驗證 active session 與輸入；
2. 經 transport 上傳 attachments；
3. 加入 optimistic user message；
4. 經 transport 啟動 run；
5. 加入 assistant placeholder；
6. 建立唯一 run subscription；
7. reducer 接收 normalized events 並更新 state。

QJudge UI、hooks 或 renderers 不得自行合併 SSE delta。

### 9.4 HITL

Ask User 與 approval 都由 `CopilotRunState` 表達。提交 answer／decision 後，transport 回傳 resumed run；provider 立即以該 run 重建 subscription。

關閉或收合卡片只是 UI presentation state，不得清除 runtime request、偽造 completed 或取消 backend run。重新進入 session 或 reload 時必須再次由 active run 恢復卡片。

Run 執行期間的 session notice 是 run presentation metadata，不是 QJudge feature-local state。Transport 將 notice 正規化為 Copilot run event；reducer 更新目前 run，terminal state 時清除。`useCopilotRun()` 提供目前 notice 給 composer 顯示。

### 9.5 Attachments 與 Artifact Panel

使用者在 composer 選取的檔案經 `CopilotTransport.uploadAttachment()` 上傳，並以 Copilot attachment part 進入 message。Attachment 狀態由 provider 管理。

Artifact Panel 是 QJudge 產品功能，透過 active Copilot session ID 與 Copilot tool parts 監看刷新條件。它不得要求 Copilot candidate import Artifact types 或 repository。

### 9.6 QJudge 特化 renderers

QJudge production chat surface 以 `CopilotPanel` 為主體，不另建一個重複 orchestration 的全能 `ChatContainer`。Message list 使用 `CopilotMessage.parts`。通用 text、reasoning、tool、approval、question 與 attachment part 走 Copilot renderer contract；既有 QJudge header、history、composer、grading、verification 與 Artifact UI 透過 `CopilotUISlots`／renderer registry 注入。

Renderer 可以做 pure mapping，但不得保存 session/run lifecycle state 或呼叫 chatbot repository。

現有 SSE callbacks 必須完成逐項 parity mapping：

- `onSessionNotice` → Copilot run notice event
- `onTodoItemsUpdate` → `data-todo-items` message part
- `onNextTurnOptions` → `data-next-turn-options` message part
- verification reports → `data-verification` message part

Next-turn chips 從最新 assistant message 的 data part 推導，不另建 `nextTurnOptions` state，避免舊回合 chips 復活。

## 10. 錯誤與恢復

所有 infrastructure error 在 adapter 邊界或 provider command 邊界正規化成 `CopilotError`，至少保留 operation、code、recoverable 與 cause。QJudge UI 透過 translations 顯示訊息。

- Session list 失敗：保留既有 list，標記錯誤並允許 `refresh()`。
- Session 載入失敗：active session 進入 error，不回寫錯誤的舊 session ID。
- Session create／rename／remove 失敗：list 與 active session 保持原值，`useCopilotSessions()` 暴露標準 `CopilotError` 供 UI 顯示與清除。
- Send 失敗：run 進入 recoverable error，保留最後輸入供 `retry()`。
- Attachment 失敗：錯誤附著在該 attachment，不清空 draft 或其他附件。
- Subscription 中斷：保留 last sequence，透過 active run 恢復。
- Stop：先關閉本地 subscription；capability 存在時取消 backend run。
- Model catalog 失敗：使用 QJudge 注入 fallback，不阻止聊天初始化。

HITL 的額外規則：

1. 長時間未回答不視為 run 完成。
2. Submit 失敗時保留原 request，讓使用者可以重試。
3. Submit 成功後使用後端回傳 run 重新訂閱，不重用過期 subscription。
4. Session switch／unmount 只關閉本地 subscription，不自動取消 backend run。
5. 同一時間每個 active runtime 最多存在一條 subscription。

## 11. QJudge UI 遷移

QJudge UI 保持既有外觀，但 production chat surface 改為公開 `CopilotPanel` 搭配 QJudge slots：

- `QJudgeChatPanel`：只設定 `CopilotUISlots` 與產品 integrations，不保存 runtime state
- History／top bar slot：使用 `CopilotSessionSummary` 與 session commands
- Message slot：接收 `CopilotMessage`／parts
- Composer slot：接收 composer、model 與 run commands
- Ask User／approval slots：接收對應 request 與 submit callback
- Artifact integration：使用公開 hook 取得 active session 與 Copilot tool parts
- Full page／embed：直接使用公開 Copilot shells 與 slots，不再以 children 繞過預設 panel orchestration
- QJudge workspace chrome：保留既有 resizable／mobile layout，在聊天區掛載同一個 `CopilotPanel`；不以 `disabled` shell wrapper 假裝 dogfood

`CopilotPanel` 與 slots 必須能表達既有 QJudge UI 所需資料；若 slot contract 缺欄位，擴充產品中立 contract，不讓 slot 回頭 import provider internals。

遷移完成後刪除：

- `useLegacyChatbotRuntime`
- `useChatbot`
- `ChatbotContext`、`useChatbotContext`、`useOptionalChatbotContext`
- legacy `ChatSessionContext`
- `legacyChatbotMapper`
- 僅服務上述 runtime 且已無 consumer 的 merge helpers／types／tests

刪除前必須以 `rg` consumer scan 與 TypeScript build 確認無剩餘引用。

## 12. 測試設計

### 12.1 Core unit tests

- reducer 的 message part merge 與 run state transitions
- session／run selectors
- stale event、sequence gap 與 terminal events
- discriminated union type tests，且必須經實際 TypeScript typecheck config 執行

### 12.2 Provider 與 hooks contract tests

使用真正的 `CopilotProvider` 搭配 Memory ports，不 mock `useCopilot*`：

- location → storage → first → create 優先序
- list 外 location session 的直接載入與失敗 fallback
- send、attachments、model selection
- optimistic messages 與 stream events
- reload／select 後的 active run 恢復
- Ask User／approval 久放、提交、失敗重試與 resume
- session notice、todo items、next-turn options 與 verification data parts
- cancel、retry、unmount cleanup
- 快速切換 session 時忽略 stale response
- transport capability 與 method contract

### 12.3 QJudge integration tests

使用 `@copilot/testing` 的 Memory adapters 掛載 QJudge UI；composition wrapper 可透過內部 dependency seam 注入 adapters，但不得 mock `useCopilot*`：

- `CopilotPanel` 搭配 QJudge slots 的 session history、model picker、composer 與 message rendering
- QJudge tool／verification renderers
- Artifact Panel refresh trigger
- full page、workspace、embed shells
- UI 不 import legacy context 或 Copilot internals

### 12.4 Browser smoke

在本地 dev services 驗證：

1. 以 `ai_session_id` deep link 開啟既有 session；
2. 發送「你好」並收到串流結果；
3. reload 後恢復 active run；
4. Ask User 久放後仍可回答並繼續；
5. approval 後恢復；
6. 附件上傳與 Artifact Panel 更新；
7. stop generation；
8. full page、workspace、embed；
9. composer 保持可見且捲動正常。

## 13. 自動化 Dependency Gates

延伸現有 Copilot boundary script 或增加專用 dogfood script，至少檢查：

- QJudge production consumer 只能 import `@copilot`。
- Tests 只能從 `@copilot/testing` 取 testing utilities。
- 禁止 `@copilot/*` 未批准 deep imports。
- Copilot candidate 禁止 import QJudge features、Router、i18next、Carbon 與 repositories。
- QJudge chatbot repository 只能出現在 infrastructure transport／model adapters。
- production source 不得包含 `useLegacyChatbotRuntime`、`useChatbotContext` 或 `useChatbot`。
- package candidate 不得包含 QJudge model IDs、translation namespaces 或 URL parameter name。

既有 gates 繼續執行：

- `npm run test:copilot`
- `npm run typecheck:copilot`
- `npm run check:copilot-boundary`
- frontend full test suite
- frontend production build
- architecture lint
- naming lint；若 repository 仍有歷史違規，必須證明本次沒有新增違規

## 14. 成功條件

全部條件同時成立才算完成：

1. QJudge App production path 實際掛載 `CopilotProvider`。
2. QJudge Chat UI 使用公開 `CopilotPanel`／shells／slots；必要的產品 integrations 只使用公開 `useCopilot*` 與 Copilot types。
3. `useLegacyChatbotRuntime`、`useChatbot` 與 legacy chatbot contexts 已移除。
4. Session、run、composer、models 與 subscription 沒有第二份 feature-local state owner。
5. QJudge consumers 只使用 `@copilot` 公開入口。
6. Copilot candidate 不依賴 QJudge product／infrastructure 實作。
7. Copilot／chatbot runtime 所需的 repository I/O 只存在於 QJudge infrastructure adapters；不限制其他 feature 本來就合法的 repository 使用。
8. URL deep link、reload、unknown-list session 與 active run restore 通過測試。
9. Ask User／approval 久放與恢復通過 integration 及 browser smoke。
10. Models、attachments、Artifact Panel 與 QJudge renderers 保持現有行為。
11. Full page、workspace、embed 與 composer overflow 行為沒有退化。
12. Typecheck、tests、boundary gates 與 production build 全部通過。
13. 沒有建立或發布 npm package。

## 15. 回滾策略

本階段不修改 backend contract 或資料庫，因此回滾單位是 frontend feature commits。若 production wiring 發生重大退化，回滾 Copilot dogfood commits即可恢復先前 runtime。

不保留 runtime feature flag 或新舊雙軌作為長期回滾機制，因為雙軌會重新引入兩份 state 與 subscription ownership。Browser smoke 完成前不得合併回 `dev`。
