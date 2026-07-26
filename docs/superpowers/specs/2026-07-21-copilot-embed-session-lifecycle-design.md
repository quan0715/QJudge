# Copilot 嵌入式寬度、Lazy Session 與初始化狀態設計

日期：2026-07-21

狀態：已核准方向，待實作計畫

範圍：frontend Copilot package candidate 與 QJudge dogfood integration

## 1. 背景

QJudge 前端目前已將 production chat surface 收斂到公開的 `CopilotProvider`、`CopilotPanel`、shells、hooks 與 slots。全頁聊天與 workspace 嵌入式聊天共用同一份 runtime，但目前仍有三項使用體驗與清潔度問題：

1. 嵌入式聊天的寬度 containment 不完整。部分滿寬且帶 padding 的 message／skeleton 元素會超出 panel；Markdown 長內容也可能把父層撐寬。
2. Header、history 與 SideMenu 的新增對話按鈕會立即呼叫 `sessions.create()`，在使用者尚未送出訊息前就建立後端空 session。
3. Provider bootstrap 期間 `listStatus` 已是 `loading`，但 `activeSession` 暫時仍是 `empty`。`CopilotPanel` 因此短暫渲染新對話標題、歡迎訊息與可重新命名的 UI，而不是穩定的 loading skeleton。

本輪同時盤點 legacy 殘留，移除已無 consumer 的 compatibility surface，但不更動 backend API contract、不建立 npm package，也不改變既有對話、串流、HITL、attachment、artifact 或 grading 行為。

## 2. 目標

- 嵌入式 chat 在窄 panel 內至少 fit container width，不產生整個 panel 或頁面的水平 overflow。
- 按下新增對話只進入本地新對話狀態；第一個有效 send 才建立後端 session。
- 初次載入與頁面刷新時，以 skeleton 呈現尚未完成的 session bootstrap，不閃現 empty-state UI。
- 新增行為由 package-candidate runtime 擁有，QJudge 繼續作為公開 API 的 dogfood consumer。
- 清除已確認無 consumer 的 legacy aliases、deprecated props、dead styles 與誤導性命名。
- 保留 `sessions.create()` 的 eager semantics，避免破壞 AI grading 等需要先取得 session ID 的程式化流程。

## 3. 非目標

- 不發布或抽出 npm package。
- 不修改 backend session/run endpoints 或資料庫 schema。
- 不把 QJudge repository DTO 全面改名為 Copilot types。
- 不重新設計聊天視覺風格、composer 功能或 session history UI。
- 不用 feature-local state 或第二套 runtime 暫存新對話。

## 4. 現況與根因

### 4.1 Width containment

`copilot.css` 目前主要補齊高度鏈的 `min-height: 0`，但 `.copilot-root`、`.copilot-panel-content`、`.copilot-panel-body`、`.copilot-conversation` 與 `.copilot-embed` 沒有完整的寬度約束。

QJudge `MessageList.module.scss` 對 list 的直接子元素設定 `width: 100%`，而 `MessageBubble` 與 skeleton stack 又帶水平 padding。在預設 content-box sizing 下，實際 outer width 會大於 100%。Markdown 內的長 token、pre、table 或 media 也缺少一致的局部 overflow policy。

### 4.2 Eager session creation

以下 UI 入口目前直接呼叫 `sessions.create()`：

- `CopilotPanel` 的 header callback
- `CopilotPanel` 的 history callback
- `QJudgeCopilotHeader`
- `SideMenu` 的新增聊天 handler

`QJudgeCopilotBoundary` 又使用 `initialSession="first-or-create"`，因此沒有 session 的帳號在 bootstrap 後也會自動建立一筆空 session。

### 4.3 Bootstrap empty-state flash

Provider 的 session list request 開始時會將 `listStatus` 設為 `loading`，但 core selector 在 `activeSessionId` 為空時仍回傳 `activeSession.status === "empty"`。`CopilotPanel` 只依 active session 與 messages 判斷內容，於是 QJudge empty-state slot 先產生歡迎訊息；Header 同時因沒有 title 而顯示新對話標題。

## 5. 採用方案

採用 runtime-owned lazy session，並以單一 active-session discriminated union 明確區分初始化與可輸入的空狀態。

不採用 feature-local pending flag，因為 full page、embed、SideMenu 與未來 package consumer 會產生不同 lifecycle owner。也不只以 `empty + listStatus` 的組合修補 UI，因為每個 slot 都必須重複正確組合兩份狀態，容易再次出現初始化閃爍。

## 6. 公開狀態與 commands

### 6.1 `CopilotActiveSessionState`

新增以下 branch：

```ts
{
  status: "initializing";
  id: null;
  data: null;
  error: null;
}
```

狀態語意如下：

| status | 語意 | Composer |
| --- | --- | --- |
| `initializing` | 正在解析 location、storage 與 session list，尚不能判斷 active session | disabled |
| `empty` | bootstrap 已完成，目前是尚未持久化的新對話 | enabled when draft/attachment is valid |
| `loading` | 已知 session ID，正在載入 session data | disabled |
| `ready` | 已有持久化 session data | follows run state |
| `error` | session list、selection 或 create/load 失敗 | retryable according to error operation |

Provider disabled 或 ownership 尚未就緒時仍不可送出；不得只因 active session 是 `empty` 就繞過 `enabled` 與 bootstrap guards。

Provider 在 enabled ownership 下、active ID 尚未決定且初始 list request 為 `idle`／`loading` 時，對 consumer 暴露 `initializing`。初始 request 完成後才暴露 `empty`。如此第一個 React render 也不會先洩漏可操作的 empty state。

### 6.2 Session commands

`useCopilotSessions()` 增加：

```ts
startNew(): void;
```

`startNew()` 的責任：

1. 增加 session revision，使既有非同步 selection/send 結果失效。
2. 關閉目前的本地 run subscription，但不取消 backend run。
3. 將 active session 清成 `empty`，active run 回到 ready/null view。
4. 清除 session location 與 last-session storage。
5. 保留 session summaries，讓使用者仍能從 history 回到舊 session。
6. 設定 runtime-owned 的 new-session intent。背景 session-list refresh 可以更新 summaries，但不得在此 intent 存續時自動選回舊 session。
7. 重設只屬於前一 session 的 UI integration state；composer draft 是否清空由既有 composer reset policy 明確處理，新增對話預設為空 draft 與空 attachments。

new-session intent 是 runtime 內部的 concurrency guard，不是 QJudge feature state。成功 create、明確 select 舊 session、provider ownership 切換或重新 mount 時會清除。它不寫入 storage，因此未送出的新對話草稿不承諾跨頁面刷新保存。

既有 `create(input?)` 保持 eager operation：呼叫即建立 transport session、選取它並回傳 ID。AI grading 與其他需要先取得 ID 的程式化 consumer 繼續使用此 API。

## 7. Lazy send lifecycle

`send(input)` 必須支援 active session 為 `empty`：

1. 驗證文字或 attachment 至少有一項有效內容。
2. 透過 runtime 內部的 `ensureSession`／單一 in-flight guard 建立 session；同一個 composer submit 不得重複 create。
3. create 成功後立即把 session 加入 summaries/runtime，選為 active session，寫入 location 與 storage。
4. 以新 session ID 上傳 attachments、加入 optimistic user message，然後呼叫 `startRun`。
5. 後續 subscription、retry 與 stream merge 沿用既有流程。

若 create 失敗：

- 回傳 rejected `CopilotSendResult`，error operation 指向 create-session。
- 保持 `empty`，不得產生假的 active ID。
- 保留 composer draft 與 attachments，讓使用者可重試。
- UI 顯示既有可恢復 error surface。

若 session 已建立但 upload 或 `startRun` 失敗，該 session 可以保留，因為建立動作已由使用者第一次 send 明確觸發；既有 retry 行為繼續適用。

Direct `useCopilot().send()` 與 `useCopilotComposer().send()` 必須共用同一個 lazy-create path。公開 `create()` 不得被改成 draft-only operation。

## 8. QJudge composition 行為

`QJudgeCopilotBoundary` 的 initial strategy 改為 `first`：

- URL 有合法 `ai_session_id`：載入該 session。
- URL session 不在 list 但可直接取得：仍可 deep link 載入。
- 沒有 URL、storage 有合法 session：使用 storage session。
- 否則選第一筆既有 session。
- 完全沒有 session：完成 bootstrap 後進入 `empty`，不呼叫 create。

所有使用者可見的新增對話入口改用 `startNew()`：

- full-page header
- embedded header
- history panel
- app SideMenu

SideMenu 點擊新增聊天時導向 `/chat` 並移除 `ai_session_id`；其他 search params 的保存方式沿用 session-location adapter 的既有 policy。使用者未送出就離開時，backend 不會增加 session。

## 9. Loading 與 empty-state UI

### 9.1 Conversation

`CopilotPanel` 的 render precedence：

1. initializing/loading
2. active/list error
3. confirmed empty state
4. message list

`initializing` 與 `loading` 都必須把狀態傳給 message-list slot，QJudge `MessageList` 顯示現有 `MessageListSkeleton`。初始化期間不得渲染 welcome message、question/approval、suggestions 或可操作的 empty state。

### 9.2 Header

QJudge header 在 `initializing` 或 `loading` 時顯示 title skeleton，並停用 session rename/menu actions。不得短暫顯示「新對話」後再換成 session title。

### 9.3 Composer

- `initializing`／`loading`：disabled。
- `empty`：允許輸入、加入附件與送出；有效 send 觸發 lazy create。
- `ready`：維持既有 run、HITL、upload 與 sending guards。
- 使用者主動 `startNew()` 後才顯示 welcome/init message；刷新中的暫態不顯示。

## 10. Width 與 overflow policy

嵌入式 chat 遵循一個垂直 scroll owner：message list。Shell、panel、conversation 與 composer 不取得第二條垂直 scrollbar。

### 10.1 Shell width chain

以下容器補齊 `min-width: 0`、`width: 100%` 或 `max-width: 100%`，並在非 scroll owner 使用適當的 `overflow: hidden`：

- `.copilot-root`
- `.copilot-embed`
- `.copilot-panel-content`
- `.copilot-panel-body`
- `.copilot-conversation`
- QJudge `.container`、`.chatOnlyRow` 與 panel chain
- message-list wrapper/list

所有滿寬且含 padding/border 的 shell、message、skeleton 與 composer element 使用 `box-sizing: border-box`。Flex/grid children 必須能 shrink，不以固定 min-content width 推開 parent。

### 10.2 Message content

- 一般文字與無分隔長 token 使用 `overflow-wrap: anywhere`／適當的 word breaking。
- Markdown root、message content、reasoning 與 tool containers 使用 `min-width: 0; max-width: 100%`。
- image、svg、video 等 media 使用 `max-width: 100%; height: auto`。
- pre、table、KaTeX 或確實需要寬度的內容在自己的 wrapper 水平捲動，不讓 `.copilot-embed` 或頁面水平捲動。
- 不直接 override Carbon `.cds--*` selector，不以全域 `!important` 壓制元件。

### 10.3 驗收尺寸

- desktop workspace，sidebar 320px、400px、700px。
- desktop artifact split 的最小 chat panel。
- 1366×768 與 1920×1080 full page。
- mobile bottom sheet 與窄 viewport。
- 長 URL、長無空白字串、code block、table、large media。

## 11. Legacy 清潔範圍

既有 production runtime 已無以下 surface：

- `useLegacyChatbotRuntime`
- `useChatbot`
- `ChatbotProvider`
- `ChatbotContext`／legacy `ChatSessionContext`
- feature-owned session/run/subscription state

本輪額外移除：

- 無 production consumer 的 `useChatScrollToBottom` alias。
- `ArtifactPanelProviderProps.sessionId` deprecated prop。
- `ChatContainer.module.scss` 中無 consumer 的 `splitRow`、`chatBody`、`messagesArea`、`composerFloat`、`loading` selectors。
- `qJudgeCopilotTransport` 內誤導性的 `legacyRuns` 命名，改為描述 repository/transport bridge ownership 的名稱。
- 與上述 dead surface 同時確認無 consumer 的註解與 exports。

以下不是本輪要刪除的 legacy runtime：

- `core/ports/chatbot.repository.ts`
- `core/types/chatbot.types.ts`
- `infrastructure/api/repositories/chatbot.repository.ts`
- `infrastructure/copilot/chatbotCopilotMapper.ts`

它們描述現有 QJudge backend repository contract，以及該 contract 到 package-candidate `CopilotTransport` 的 infrastructure conversion seam。Shared/core Copilot candidate 不得 import 這些 QJudge contract；boundary gate 繼續保證隔離。全面改名或改 backend DTO 屬另一個 migration，不在本輪混入。

## 12. 測試策略

### 12.1 Core type/selector tests

- `initializing` branch 的 discriminated union/typecheck。
- active session 各狀態的 selector/provider derivation。

### 12.2 Provider tests

- bootstrap 開始為 `initializing`，完成後才成為 `empty`／`loading`／`ready`。
- `initialSession="first"` 且 list 為空時不呼叫 create。
- `startNew()` 不呼叫 transport create，清除 location/storage，保留 summaries。
- `startNew()` 關閉本地 subscription 但不 cancel backend run。
- `startNew()` 後的 session-list refresh 不得自動選回舊 session。
- empty state 第一次 send 只 create 一次，並以新 ID upload/startRun。
- create failure 保留 draft/attachments，允許重試。
- eager `sessions.create()` contract 保持不變。
- 快速 select/startNew/send 的 stale result 不得覆蓋目前 session。

### 12.3 UI integration tests

- Provider bootstrap 未完成時，QJudge panel 顯示 message/title skeleton，不顯示 welcome 或新對話 title。
- bootstrap 完成且無 session 時顯示真正 empty state，composer 可用。
- full page、embed、history 與 SideMenu 的新增按鈕不建立 session；首次 send 才建立。
- 既有 session 的 rename、delete、history selection 行為維持。

### 12.4 Width regression

- CSS contract tests 檢查必要的 width containment、border-box 與 local overflow rules。
- Storybook 或 browser fixture 注入長 token、code、table 與 media。
- Browser smoke 檢查 container `scrollWidth <= clientWidth`；pre/table 可有自己的水平 scrollbar。
- 確認 message list 是唯一垂直 scroll owner，composer 始終可見。

### 12.5 Legacy gates

- `rg` 確認 dead aliases/props/selectors 無 production consumer。
- `npm run check:copilot-boundary` 繼續禁止 legacy runtime symbols 與 package deep imports。

## 13. 品質門檻

實作完成前至少通過：

- targeted core/provider/UI tests
- `npm run test:copilot`
- `npm run typecheck:copilot`
- frontend typecheck
- `npm run check:copilot-boundary`
- architecture lint
- naming lint（不得新增違規）
- frontend production build
- full frontend test suite
- local browser smoke：full page、desktop embed、mobile embed

## 14. 成功條件

1. Embedded chat 的 shell/page 不因 message、Markdown、skeleton 或 composer 產生水平 overflow。
2. `+` 不發出 create-session request；第一個有效 send 才建立一筆 session。
3. 首次 send 的 create、location update、attachment upload 與 run start 使用同一個 session ID，且不重複建立。
4. 刷新時先顯示 skeleton，不閃現 welcome、新對話標題或 rename UI。
5. 確認沒有 session 後的 empty state 仍能直接輸入並送出。
6. AI grading 等 explicit `sessions.create()` consumer 行為不變。
7. 無第二份 QJudge runtime/session owner。
8. 已列出的 dead legacy surface 移除，backend repository conversion seam 保持隔離。
9. 既有 streaming、HITL、attachments、artifacts、models 與 URL deep link tests 不退化。

## 15. 回滾策略

本輪不改 backend contract。回滾單位為 frontend runtime/UI commits：

- Width changes 可獨立回滾，不影響 session lifecycle。
- Lazy session 與 initializing state 必須成組回滾，避免 UI 允許 empty send 但 runtime 不會 create。
- Legacy dead-code cleanup 可獨立回滾，但不得恢復舊 runtime wiring。
