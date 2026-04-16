# QJudge Chat UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `@carbon/ai-chat` web component with custom React components using `@carbon/react` primitives, fully controlled by existing `useChatbot` hook.

**Architecture:** Three-layer design — existing hooks (`useChatbot`) provide state, new React components consume that state as props, CSS Modules with Carbon tokens provide styling. The key insight is `useChatbot.ts` already handles 90% of logic (sessions, streaming, abort); we only need to (1) add `awaiting_approval` event support and (2) build UI components.

**Tech Stack:** React 18, `@carbon/react` components, CSS Modules, Carbon design tokens (`--cds-*`), existing `react-markdown` + `rehype-highlight` + `remark-gfm`.

**Spec:** `docs/superpowers/specs/2026-04-17-qjudge-chat-ui-design.md`

---

## File Structure

```
frontend/src/
  core/types/
    chatbot.types.ts                    (modify — add awaiting_approval event + ApprovalRequest type)

  infrastructure/api/repositories/
    chatbot.repository.ts               (modify — handle awaiting_approval in _handleStreamEvent)

  features/chatbot/
    index.ts                            (modify — update exports)
    hooks/
      useChatbot.ts                     (modify — add pendingApproval state + submitApproval action)

    components/
      chat-ui/
        ChatContainer.tsx               (create — composition root, connects hooks to UI)
        ChatContainer.module.scss       (create — layout, background gradient)
        MessageList.tsx                 (create — scrollable message feed)
        MessageList.module.scss         (create — scroll container, auto-scroll)
        MessageBubble.tsx               (create — user/ai message rendering)
        MessageBubble.module.scss       (create — bubble styles, alignment)
        ChainOfThought.tsx              (create — CoT steps with Accordion)
        ChainOfThought.module.scss      (create — step status icons)
        HITLCard.tsx                    (create — approve/reject card)
        HITLCard.module.scss            (create — card styling)
        ComposerBar.tsx                 (create — input + send + IME handling)
        ComposerBar.module.scss         (create — bottom bar styling)
        ChatHistoryPanel.tsx            (create — session list sidebar)
        ChatHistoryPanel.module.scss    (create — sidebar, time groups)
        ChatTopBar.tsx                  (create — mobile header)
        ChatTopBar.module.scss          (create — top bar styling)

      ChatFullPage.tsx                  (rewrite — use ChatContainer)
      ChatFullPage.module.scss          (rewrite — full page layout)
      ChatStandalonePage.tsx            (keep — minimal changes)
      ChatbotWidget.tsx                 (rewrite — sidebar mode using ChatContainer)
      ChatbotSidePanel.module.scss      (modify — sidebar layout tweaks)
      AIExamQuestionCard.tsx            (keep)
      extractExamCards.ts               (keep)
```

---

## Task 1: Add `awaiting_approval` Support to Types and Repository

The repository's `_handleStreamEvent` currently ignores `awaiting_approval` events. The `ChatbotWidget` handled these by directly injecting Carbon CardItems. We need to route these through the proper data flow.

**Files:**
- Modify: `frontend/src/core/types/chatbot.types.ts`
- Modify: `frontend/src/infrastructure/api/repositories/chatbot.repository.ts`

- [ ] **Step 1: Add ApprovalRequest type and extend StreamCallbacks**

In `frontend/src/core/types/chatbot.types.ts`, add after the `UserInputRequest` interface (~line 162):

```typescript
// ===== HITL Approval =====
export interface ApprovalActionRequest {
  name: string;
  args?: Record<string, unknown>;
}

export interface ApprovalRequest {
  actionRequests: ApprovalActionRequest[];
  reviewConfigs?: Array<{ actionName: string; allowedDecisions: string[] }>;
}
```

Add `awaiting_approval` to the `StreamEventType` union (~line 6):

```typescript
export type StreamEventType =
  | "run_started"
  | "agent_message_delta"
  | "thinking_delta"
  | "verification_report"
  | "tool_call_started"
  | "tool_call_finished"
  | "usage_report"
  | "run_completed"
  | "run_failed"
  | "awaiting_approval";
```

Add callback to `StreamCallbacks` (~line 171):

```typescript
export interface StreamCallbacks {
  onMessageUpdate?: (message: Partial<ChatMessage>) => void;
  onComplete?: (session: ChatSession) => void;
  onError?: (error: string) => void;
  onUserInputRequest?: (request: UserInputRequest) => void;
  onVerificationReport?: (report: VerificationReport) => void;
  onAwaitingApproval?: (request: ApprovalRequest) => void;
}
```

- [ ] **Step 2: Handle awaiting_approval in repository**

In `frontend/src/infrastructure/api/repositories/chatbot.repository.ts`, add `awaiting_approval` to the `V2StreamEvent` interface (~line 17):

```typescript
interface V2StreamEvent {
  type:
    | "run_started"
    | "agent_message_delta"
    | "thinking_delta"
    | "verification_report"
    | "tool_call_started"
    | "tool_call_finished"
    | "usage_report"
    | "run_completed"
    | "run_failed"
    | "awaiting_approval";

  // ... existing fields ...

  // awaiting_approval
  action_requests?: Array<{ name: string; args?: Record<string, unknown> }>;
  review_configs?: Array<{ action_name: string; allowed_decisions: string[] }>;
}
```

Add the case to `_handleStreamEvent` (before the `default:` case, ~line 612):

```typescript
case "awaiting_approval": {
  if (event.action_requests?.length) {
    callbacks.onAwaitingApproval?.({
      actionRequests: event.action_requests.map((a) => ({
        name: a.name,
        args: a.args,
      })),
      reviewConfigs: event.review_configs?.map((r) => ({
        actionName: r.action_name,
        allowedDecisions: r.allowed_decisions,
      })),
    });
  }
  break;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No new errors related to `awaiting_approval` or `ApprovalRequest`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/core/types/chatbot.types.ts frontend/src/infrastructure/api/repositories/chatbot.repository.ts
git commit -m "feat(chatbot): add awaiting_approval event support to types and repository"
```

---

## Task 2: Extend useChatbot Hook with Approval State

**Files:**
- Modify: `frontend/src/features/chatbot/hooks/useChatbot.ts`

- [ ] **Step 1: Add pendingApproval state and submitApproval action**

Import `ApprovalRequest` at top of file:

```typescript
import type {
  BackgroundInformation,
  ChatMessage,
  ChatSession,
  UserInputRequest,
  ChatContext,
  ApprovalRequest,
} from "@/core/types/chatbot.types";
```

Add to `UseChatbotReturn` interface:

```typescript
pendingApproval: ApprovalRequest | null;
submitApproval: (decision: "approve" | "reject") => Promise<void>;
dismissApproval: () => void;
```

Add state (~after `pendingUserInput` state, line 76):

```typescript
const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);
```

Add `onAwaitingApproval` callback in the `sendMessage` function's `chatbotRepository.sendMessageStream` call (alongside the existing `onUserInputRequest`):

```typescript
onAwaitingApproval: (request) => {
  setPendingApproval(request);
},
```

Add `submitApproval` callback:

```typescript
const submitApproval = useCallback(
  async (decision: "approve" | "reject") => {
    if (!currentSessionId) return;
    setPendingApproval(null);
    await resumeAgent(decision);
  },
  [currentSessionId, resumeAgent],
);

const dismissApproval = useCallback(() => {
  setPendingApproval(null);
}, []);
```

Add to return object:

```typescript
return {
  // ... existing ...
  pendingApproval,
  submitApproval,
  dismissApproval,
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/chatbot/hooks/useChatbot.ts
git commit -m "feat(chatbot): add HITL approval state to useChatbot hook"
```

---

## Task 3: Build MessageBubble Component

The core rendering unit: displays a single message (user or AI) with markdown, thinking info, and tool executions.

**Files:**
- Create: `frontend/src/features/chatbot/components/chat-ui/MessageBubble.tsx`
- Create: `frontend/src/features/chatbot/components/chat-ui/MessageBubble.module.scss`

- [ ] **Step 1: Create MessageBubble component**

```tsx
// frontend/src/features/chatbot/components/chat-ui/MessageBubble.tsx
import type { ChatMessage } from "@/core/types/chatbot.types";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import { ChainOfThought } from "./ChainOfThought";
import styles from "./MessageBubble.module.scss";

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={`${styles.bubble} ${isUser ? styles.user : styles.ai}`}>
      {!isUser && (
        <div className={styles.avatar} aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 32 32" fill="currentColor">
            <path d="M16 2a14 14 0 1 0 14 14A14 14 0 0 0 16 2Zm0 5a4.5 4.5 0 1 1-4.5 4.5A4.5 4.5 0 0 1 16 7Zm8 17.92a11.93 11.93 0 0 1-16 0v-.58A5.2 5.2 0 0 1 13 19h6a5.2 5.2 0 0 1 5 5.34Z" />
          </svg>
        </div>
      )}

      <div className={styles.content}>
        {!isUser && (
          <div className={styles.meta}>
            <span className={styles.name}>QJudge AI</span>
            <span className={styles.time}>
              {message.timestamp.toLocaleTimeString("zh-TW", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        )}

        {isUser && (
          <div className={styles.metaRight}>
            <span className={styles.time}>
              {message.timestamp.toLocaleTimeString("zh-TW", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        )}

        {/* Thinking/Reasoning block */}
        {!isUser && message.thinkingInfo?.thinking && (
          <details className={styles.thinking}>
            <summary>推理過程</summary>
            <div className={styles.thinkingContent}>
              {message.thinkingInfo.thinking}
            </div>
          </details>
        )}

        {/* CoT steps */}
        {!isUser && message.toolExecutions && message.toolExecutions.length > 0 && (
          <ChainOfThought
            steps={message.toolExecutions}
            isProcessing={!!message.toolName}
            currentToolName={message.toolName}
          />
        )}

        {/* Message content */}
        {message.content ? (
          isUser ? (
            <p className={styles.text}>{message.content}</p>
          ) : (
            <MarkdownRenderer
              enableHighlight
              enableCopy
              enableMath
              className={styles.markdown}
            >
              {message.content}
            </MarkdownRenderer>
          )
        ) : (
          !isUser && message.isThinking && (
            <span className={styles.thinkingDots}>
              <span />
              <span />
              <span />
            </span>
          )
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create MessageBubble styles**

```scss
// frontend/src/features/chatbot/components/chat-ui/MessageBubble.module.scss
.bubble {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  max-width: 100%;
}

.user {
  flex-direction: row-reverse;

  .content {
    align-items: flex-end;
  }
}

.ai {
  flex-direction: row;
}

.avatar {
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: var(--cds-ai-aura-start, #4589ff);
  color: var(--cds-text-on-color, #fff);
  display: flex;
  align-items: center;
  justify-content: center;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
  max-width: min(80%, 672px);
}

.meta,
.metaRight {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  font-size: 0.75rem;
  color: var(--cds-text-secondary, #525252);
}

.metaRight {
  justify-content: flex-end;
}

.name {
  font-weight: 600;
}

.time {
  font-size: 0.6875rem;
}

.text {
  margin: 0;
  padding: 0.5rem 0.75rem;
  background: var(--cds-layer-accent-01, #e0e0e0);
  border-radius: 12px 12px 2px 12px;
  font-size: 0.875rem;
  line-height: 1.4;
  word-break: break-word;
}

.markdown {
  font-size: 0.875rem;
  line-height: 1.5;
}

.thinking {
  font-size: 0.8125rem;
  color: var(--cds-text-secondary, #525252);
  border-left: 2px solid var(--cds-border-subtle-01, #c6c6c6);
  padding-left: 0.75rem;
  margin-bottom: 0.25rem;

  summary {
    cursor: pointer;
    font-weight: 500;
    user-select: none;
  }
}

.thinkingContent {
  margin-top: 0.25rem;
  white-space: pre-wrap;
  max-height: 200px;
  overflow-y: auto;
}

.thinkingDots {
  display: inline-flex;
  gap: 4px;
  padding: 0.5rem 0;

  span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--cds-text-secondary, #525252);
    animation: dotPulse 1.4s infinite ease-in-out both;

    &:nth-child(1) { animation-delay: -0.32s; }
    &:nth-child(2) { animation-delay: -0.16s; }
  }
}

@keyframes dotPulse {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/chatbot/components/chat-ui/MessageBubble.tsx \
       frontend/src/features/chatbot/components/chat-ui/MessageBubble.module.scss
git commit -m "feat(chatbot): add MessageBubble component with markdown + thinking + CoT"
```

---

## Task 4: Build ChainOfThought Component

Displays tool execution steps using Carbon's `Accordion`.

**Files:**
- Create: `frontend/src/features/chatbot/components/chat-ui/ChainOfThought.tsx`
- Create: `frontend/src/features/chatbot/components/chat-ui/ChainOfThought.module.scss`

- [ ] **Step 1: Create ChainOfThought component**

```tsx
// frontend/src/features/chatbot/components/chat-ui/ChainOfThought.tsx
import { Accordion, AccordionItem } from "@carbon/react";
import { Checkmark, Warning, InProgress } from "@carbon/icons-react";
import type { ToolInfo } from "@/core/types/chatbot.types";
import styles from "./ChainOfThought.module.scss";

interface ChainOfThoughtProps {
  steps: ToolInfo[];
  isProcessing: boolean;
  currentToolName?: string;
}

export function ChainOfThought({ steps, isProcessing, currentToolName }: ChainOfThoughtProps) {
  return (
    <div className={styles.cot}>
      <div className={styles.label}>推理步驟</div>
      <Accordion size="sm" className={styles.accordion}>
        {steps.map((step, i) => {
          const isDone = step.result !== undefined || step.isError;
          const isFailed = step.isError;
          const StatusIcon = isFailed ? Warning : isDone ? Checkmark : InProgress;
          const statusClass = isFailed ? styles.failure : isDone ? styles.success : styles.processing;

          return (
            <AccordionItem
              key={step.toolCallId || i}
              title={
                <span className={styles.stepTitle}>
                  <StatusIcon size={16} className={statusClass} />
                  {step.toolName} #{i + 1}
                </span>
              }
            >
              {step.inputData && (
                <div className={styles.section}>
                  <div className={styles.sectionLabel}>輸入</div>
                  <pre className={styles.json}>
                    {JSON.stringify(step.inputData, null, 2)}
                  </pre>
                </div>
              )}
              {step.result && (
                <div className={styles.section}>
                  <div className={styles.sectionLabel}>輸出</div>
                  <pre className={styles.json}>
                    {typeof step.result === "string"
                      ? step.result
                      : JSON.stringify(step.result, null, 2)}
                  </pre>
                </div>
              )}
            </AccordionItem>
          );
        })}

        {/* Currently processing step (no result yet) */}
        {isProcessing && currentToolName && (
          <AccordionItem
            open
            title={
              <span className={styles.stepTitle}>
                <InProgress size={16} className={styles.processing} />
                {currentToolName} #{steps.length + 1}
              </span>
            }
          >
            <div className={styles.processingText}>處理中…</div>
          </AccordionItem>
        )}
      </Accordion>
    </div>
  );
}
```

- [ ] **Step 2: Create ChainOfThought styles**

```scss
// frontend/src/features/chatbot/components/chat-ui/ChainOfThought.module.scss
.cot {
  margin-bottom: 0.5rem;
}

.label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--cds-text-secondary, #525252);
  margin-bottom: 0.25rem;
}

.accordion {
  :global(.cds--accordion__content) {
    padding: 0.5rem 0;
  }
}

.stepTitle {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
}

.success { color: var(--cds-support-success, #198038); }
.failure { color: var(--cds-support-error, #da1e28); }
.processing {
  color: var(--cds-interactive, #0f62fe);
  animation: spin 1.2s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.section {
  margin-bottom: 0.5rem;
}

.sectionLabel {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--cds-text-secondary, #525252);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 0.125rem;
}

.json {
  font-size: 0.75rem;
  line-height: 1.4;
  background: var(--cds-layer-02, #f4f4f4);
  border-radius: 4px;
  padding: 0.5rem;
  margin: 0;
  overflow-x: auto;
  max-height: 150px;
  overflow-y: auto;
}

.processingText {
  font-size: 0.8125rem;
  color: var(--cds-text-secondary, #525252);
  font-style: italic;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/chatbot/components/chat-ui/ChainOfThought.tsx \
       frontend/src/features/chatbot/components/chat-ui/ChainOfThought.module.scss
git commit -m "feat(chatbot): add ChainOfThought component with Carbon Accordion"
```

---

## Task 5: Build HITLCard Component

Displays a tool call approval card with approve/reject buttons.

**Files:**
- Create: `frontend/src/features/chatbot/components/chat-ui/HITLCard.tsx`
- Create: `frontend/src/features/chatbot/components/chat-ui/HITLCard.module.scss`

- [ ] **Step 1: Create HITLCard component**

```tsx
// frontend/src/features/chatbot/components/chat-ui/HITLCard.tsx
import { useState } from "react";
import { Tile, Button, InlineLoading } from "@carbon/react";
import type { ApprovalRequest } from "@/core/types/chatbot.types";
import styles from "./HITLCard.module.scss";

interface HITLCardProps {
  request: ApprovalRequest;
  onDecision: (decision: "approve" | "reject") => void;
}

export function HITLCard({ request, onDecision }: HITLCardProps) {
  const [submitting, setSubmitting] = useState(false);

  const action = request.actionRequests[0];
  if (!action) return null;

  const handleDecision = (decision: "approve" | "reject") => {
    setSubmitting(true);
    onDecision(decision);
  };

  return (
    <div className={styles.wrapper}>
      <Tile className={styles.card}>
        <div className={styles.title}>
          工具呼叫確認：<code>{action.name}</code>
        </div>
        {action.args && Object.keys(action.args).length > 0 && (
          <pre className={styles.args}>
            {JSON.stringify(action.args, null, 2)}
          </pre>
        )}

        {submitting ? (
          <InlineLoading description="處理中…" />
        ) : (
          <div className={styles.actions}>
            <Button
              kind="primary"
              size="sm"
              onClick={() => handleDecision("approve")}
            >
              確認執行
            </Button>
            <Button
              kind="danger"
              size="sm"
              onClick={() => handleDecision("reject")}
            >
              取消
            </Button>
          </div>
        )}
      </Tile>
    </div>
  );
}
```

- [ ] **Step 2: Create HITLCard styles**

```scss
// frontend/src/features/chatbot/components/chat-ui/HITLCard.module.scss
.wrapper {
  padding: 0.5rem 1rem;
  max-width: min(80%, 672px);
}

.card {
  border-left: 3px solid var(--cds-support-warning, #f1c21b);
  padding: 1rem;
}

.title {
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 0.5rem;

  code {
    background: var(--cds-layer-02, #f4f4f4);
    padding: 0.125rem 0.375rem;
    border-radius: 3px;
    font-size: 0.8125rem;
  }
}

.args {
  font-size: 0.75rem;
  line-height: 1.4;
  background: var(--cds-layer-02, #f4f4f4);
  border-radius: 4px;
  padding: 0.5rem;
  margin: 0 0 0.75rem;
  overflow-x: auto;
  max-height: 200px;
  overflow-y: auto;
}

.actions {
  display: flex;
  gap: 0.5rem;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/chatbot/components/chat-ui/HITLCard.tsx \
       frontend/src/features/chatbot/components/chat-ui/HITLCard.module.scss
git commit -m "feat(chatbot): add HITLCard component for tool call approval"
```

---

## Task 6: Build MessageList Component

Scrollable message feed that renders MessageBubble instances and auto-scrolls to bottom.

**Files:**
- Create: `frontend/src/features/chatbot/components/chat-ui/MessageList.tsx`
- Create: `frontend/src/features/chatbot/components/chat-ui/MessageList.module.scss`

- [ ] **Step 1: Create MessageList component**

```tsx
// frontend/src/features/chatbot/components/chat-ui/MessageList.tsx
import { useRef, useEffect } from "react";
import type { ChatMessage } from "@/core/types/chatbot.types";
import type { ApprovalRequest } from "@/core/types/chatbot.types";
import { MessageBubble } from "./MessageBubble";
import { HITLCard } from "./HITLCard";
import styles from "./MessageList.module.scss";

interface MessageListProps {
  messages: ChatMessage[];
  pendingApproval: ApprovalRequest | null;
  onApprovalDecision: (decision: "approve" | "reject") => void;
}

export function MessageList({ messages, pendingApproval, onApprovalDecision }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive or content changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Only auto-scroll if user is near the bottom (within 150px)
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 150;

    if (isNearBottom) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, pendingApproval]);

  return (
    <div className={styles.list} ref={containerRef}>
      {messages.length === 0 && (
        <div className={styles.empty}>
          <p>你好！我是 QJudge AI 助教，有什麼可以幫你的嗎？</p>
        </div>
      )}

      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}

      {pendingApproval && (
        <HITLCard request={pendingApproval} onDecision={onApprovalDecision} />
      )}

      <div ref={endRef} />
    </div>
  );
}
```

- [ ] **Step 2: Create MessageList styles**

```scss
// frontend/src/features/chatbot/components/chat-ui/MessageList.module.scss
.list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 1rem 0;
  scroll-behavior: smooth;

  // Thin scrollbar
  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--cds-border-subtle-01, #c6c6c6);
    border-radius: 3px;
  }
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--cds-text-secondary, #525252);
  font-size: 0.875rem;
  text-align: center;
  padding: 2rem;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/chatbot/components/chat-ui/MessageList.tsx \
       frontend/src/features/chatbot/components/chat-ui/MessageList.module.scss
git commit -m "feat(chatbot): add MessageList with auto-scroll and HITL card rendering"
```

---

## Task 7: Build ComposerBar Component

Input area using Carbon `TextArea`. Native IME handling — no hacks needed.

**Files:**
- Create: `frontend/src/features/chatbot/components/chat-ui/ComposerBar.tsx`
- Create: `frontend/src/features/chatbot/components/chat-ui/ComposerBar.module.scss`

- [ ] **Step 1: Create ComposerBar component**

```tsx
// frontend/src/features/chatbot/components/chat-ui/ComposerBar.tsx
import { useRef, useState, useCallback } from "react";
import { IconButton } from "@carbon/react";
import { Send, StopFilled } from "@carbon/icons-react";
import styles from "./ComposerBar.module.scss";

interface ComposerBarProps {
  onSend: (text: string) => void;
  onStop?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function ComposerBar({
  onSend,
  onStop,
  isStreaming,
  disabled = false,
  placeholder = "輸入訊息…",
}: ComposerBarProps) {
  const [value, setValue] = useState("");
  const composingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled || isStreaming) return;
    onSend(trimmed);
    setValue("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, isStreaming, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // During IME composition, ignore Enter
      if (composingRef.current) return;

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    // Auto-resize
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, []);

  const canSend = value.trim().length > 0 && !disabled && !isStreaming;

  return (
    <div className={styles.bar}>
      {/* Future: attach button slot goes here */}
      <div className={styles.inputWrapper}>
        <textarea
          ref={textareaRef}
          className={styles.input}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={() => { composingRef.current = false; }}
          placeholder={placeholder}
          rows={1}
          disabled={disabled}
          aria-label="訊息輸入"
        />
        {isStreaming ? (
          <IconButton
            kind="ghost"
            size="sm"
            label="停止生成"
            onClick={onStop}
            className={styles.sendBtn}
          >
            <StopFilled size={20} />
          </IconButton>
        ) : (
          <IconButton
            kind="ghost"
            size="sm"
            label="送出"
            onClick={handleSubmit}
            disabled={!canSend}
            className={styles.sendBtn}
          >
            <Send size={20} />
          </IconButton>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create ComposerBar styles**

```scss
// frontend/src/features/chatbot/components/chat-ui/ComposerBar.module.scss
.bar {
  flex-shrink: 0;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--cds-border-subtle-01, #e0e0e0);
  background: var(--cds-layer-01, #f4f4f4);
}

.inputWrapper {
  display: flex;
  align-items: flex-end;
  gap: 0.25rem;
  background: var(--cds-field-01, #fff);
  border: 1px solid var(--cds-border-strong-01, #8d8d8d);
  border-radius: 8px;
  padding: 0.25rem 0.25rem 0.25rem 0.75rem;
  transition: border-color 150ms ease;

  &:focus-within {
    border-color: var(--cds-focus, #0f62fe);
    outline: 1px solid var(--cds-focus, #0f62fe);
  }
}

.input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-family: inherit;
  font-size: 0.875rem;
  line-height: 1.4;
  resize: none;
  padding: 0.375rem 0;
  min-height: 1.4em;
  max-height: 160px;
  color: var(--cds-text-primary, #161616);

  &::placeholder {
    color: var(--cds-text-placeholder, #a8a8a8);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}

.sendBtn {
  flex-shrink: 0;
  align-self: flex-end;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/chatbot/components/chat-ui/ComposerBar.tsx \
       frontend/src/features/chatbot/components/chat-ui/ComposerBar.module.scss
git commit -m "feat(chatbot): add ComposerBar with native IME support"
```

---

## Task 8: Build ChatHistoryPanel Component

Session list sidebar with time grouping, rename, and delete. Uses Carbon `OverflowMenu`.

**Files:**
- Create: `frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.tsx`
- Create: `frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.module.scss`

- [ ] **Step 1: Create ChatHistoryPanel component**

```tsx
// frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.tsx
import { useState, useMemo, useCallback } from "react";
import { IconButton, OverflowMenu, OverflowMenuItem } from "@carbon/react";
import { Add, Close } from "@carbon/icons-react";
import type { ChatSession } from "@/core/types/chatbot.types";
import styles from "./ChatHistoryPanel.module.scss";

interface ChatHistoryPanelProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, name: string) => void;
  onClose?: () => void;
  showCloseButton?: boolean;
}

interface HistoryGroup {
  label: string;
  sessions: ChatSession[];
}

function groupSessions(sessions: ChatSession[]): HistoryGroup[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86_400_000;
  const weekStart = todayStart - 7 * 86_400_000;

  const groups: Record<string, ChatSession[]> = {
    "今天": [],
    "昨天": [],
    "過去 7 天": [],
    "更早": [],
  };

  for (const s of sessions) {
    const ts = s.updatedAt.getTime();
    if (ts >= todayStart) groups["今天"].push(s);
    else if (ts >= yesterdayStart) groups["昨天"].push(s);
    else if (ts >= weekStart) groups["過去 7 天"].push(s);
    else groups["更早"].push(s);
  }

  return Object.entries(groups)
    .filter(([, list]) => list.length > 0)
    .map(([label, list]) => ({ label, sessions: list }));
}

export function ChatHistoryPanel({
  sessions,
  currentSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onRenameSession,
  onClose,
  showCloseButton = false,
}: ChatHistoryPanelProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const groups = useMemo(() => groupSessions(sessions), [sessions]);

  const startRename = useCallback((session: ChatSession) => {
    setRenamingId(session.id);
    setRenameValue(session.title || "");
  }, []);

  const commitRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      onRenameSession(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue("");
  }, [renamingId, renameValue, onRenameSession]);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>對話紀錄</h3>
        <div className={styles.headerActions}>
          <IconButton kind="ghost" size="sm" label="新對話" onClick={onNewChat}>
            <Add size={20} />
          </IconButton>
          {showCloseButton && onClose && (
            <IconButton kind="ghost" size="sm" label="關閉" onClick={onClose}>
              <Close size={20} />
            </IconButton>
          )}
        </div>
      </div>

      <div className={styles.list}>
        {groups.length === 0 && (
          <div className={styles.empty}>尚無對話記錄</div>
        )}

        {groups.map((group) => (
          <div key={group.label} className={styles.group}>
            <div className={styles.groupLabel}>{group.label}</div>
            {group.sessions.map((session) => (
              <div
                key={session.id}
                className={`${styles.item} ${
                  session.id === currentSessionId ? styles.active : ""
                }`}
                onClick={() => onSelectSession(session.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSelectSession(session.id);
                }}
              >
                {renamingId === session.id ? (
                  <input
                    className={styles.renameInput}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") {
                        setRenamingId(null);
                        setRenameValue("");
                      }
                    }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className={styles.itemName}>
                    {session.title || `對話 ${session.id.slice(0, 8)}…`}
                  </span>
                )}

                <OverflowMenu
                  size="sm"
                  flipped
                  className={styles.overflow}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                >
                  <OverflowMenuItem
                    itemText="重新命名"
                    onClick={() => startRename(session)}
                  />
                  <OverflowMenuItem
                    itemText="刪除"
                    isDelete
                    hasDivider
                    onClick={() => onDeleteSession(session.id)}
                  />
                </OverflowMenu>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create ChatHistoryPanel styles**

```scss
// frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.module.scss
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--cds-layer-01, #f4f4f4);
  border-right: 1px solid var(--cds-border-subtle-01, #e0e0e0);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--cds-border-subtle-01, #e0e0e0);
}

.title {
  font-size: 0.875rem;
  font-weight: 600;
  margin: 0;
}

.headerActions {
  display: flex;
  gap: 0.25rem;
}

.list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 0;
}

.empty {
  padding: 1rem;
  font-size: 0.875rem;
  color: var(--cds-text-secondary, #525252);
}

.group {
  margin-bottom: 0.5rem;
}

.groupLabel {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--cds-text-secondary, #525252);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 0.5rem 1rem 0.25rem;
}

.item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem 0.5rem 0.5rem 1rem;
  cursor: pointer;
  transition: background 150ms ease;

  &:hover {
    background: var(--cds-layer-hover-01, #e8e8e8);
  }
}

.active {
  background: var(--cds-layer-selected-01, #e0e0e0);

  &:hover {
    background: var(--cds-layer-selected-hover-01, #d1d1d1);
  }
}

.itemName {
  flex: 1;
  font-size: 0.8125rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.overflow {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 150ms ease;

  .item:hover & {
    opacity: 1;
  }
}

.renameInput {
  flex: 1;
  font-size: 0.8125rem;
  border: 1px solid var(--cds-focus, #0f62fe);
  border-radius: 2px;
  padding: 0.125rem 0.25rem;
  background: var(--cds-field-01, #fff);
  outline: none;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.tsx \
       frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.module.scss
git commit -m "feat(chatbot): add ChatHistoryPanel with time grouping and overflow menu"
```

---

## Task 9: Build ChatTopBar Component (Mobile Header)

Header bar for mobile full-page mode with history toggle and new chat button.

**Files:**
- Create: `frontend/src/features/chatbot/components/chat-ui/ChatTopBar.tsx`
- Create: `frontend/src/features/chatbot/components/chat-ui/ChatTopBar.module.scss`

- [ ] **Step 1: Create ChatTopBar component**

```tsx
// frontend/src/features/chatbot/components/chat-ui/ChatTopBar.tsx
import { IconButton } from "@carbon/react";
import { RecentlyViewed, Edit } from "@carbon/icons-react";
import styles from "./ChatTopBar.module.scss";

interface ChatTopBarProps {
  title?: string;
  onToggleHistory: () => void;
  onNewChat: () => void;
}

export function ChatTopBar({ title = "QJudge AI 助教", onToggleHistory, onNewChat }: ChatTopBarProps) {
  return (
    <div className={styles.bar}>
      <IconButton kind="ghost" size="sm" label="對話紀錄" onClick={onToggleHistory}>
        <RecentlyViewed size={20} />
      </IconButton>
      <span className={styles.title}>{title}</span>
      <IconButton kind="ghost" size="sm" label="新對話" onClick={onNewChat}>
        <Edit size={20} />
      </IconButton>
    </div>
  );
}
```

- [ ] **Step 2: Create ChatTopBar styles**

```scss
// frontend/src/features/chatbot/components/chat-ui/ChatTopBar.module.scss
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem;
  border-bottom: 1px solid var(--cds-border-subtle-01, #e0e0e0);
  background: var(--cds-layer-01, #f4f4f4);
  flex-shrink: 0;
}

.title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--cds-text-primary, #161616);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/chatbot/components/chat-ui/ChatTopBar.tsx \
       frontend/src/features/chatbot/components/chat-ui/ChatTopBar.module.scss
git commit -m "feat(chatbot): add ChatTopBar mobile header component"
```

---

## Task 10: Build ChatContainer — The Composition Root

Connects `useChatbot` hook to all UI components. Supports two modes: `full` (full-page with history panel) and `sidebar` (widget mode, no history panel).

**Files:**
- Create: `frontend/src/features/chatbot/components/chat-ui/ChatContainer.tsx`
- Create: `frontend/src/features/chatbot/components/chat-ui/ChatContainer.module.scss`

- [ ] **Step 1: Create ChatContainer component**

```tsx
// frontend/src/features/chatbot/components/chat-ui/ChatContainer.tsx
import { useState, useCallback } from "react";
import { useChatbot } from "../../hooks/useChatbot";
import type { ChatContext } from "@/core/types/chatbot.types";
import { MessageList } from "./MessageList";
import { ComposerBar } from "./ComposerBar";
import { ChatHistoryPanel } from "./ChatHistoryPanel";
import { ChatTopBar } from "./ChatTopBar";
import styles from "./ChatContainer.module.scss";

interface ChatContainerProps {
  mode: "full" | "sidebar";
  context?: ChatContext | null;
  onProblemUpdated?: () => void;
  className?: string;
}

export function ChatContainer({ mode, context, onProblemUpdated, className }: ChatContainerProps) {
  const {
    sessions,
    currentSessionId,
    currentSession,
    isStreaming,
    isInitializing,
    pendingApproval,
    createSession,
    deleteSession,
    switchSession,
    renameSession,
    sendMessage,
    stopStreaming,
    submitApproval,
  } = useChatbot({
    enabled: true,
    context,
    onProblemUpdated,
  });

  const [historyOpen, setHistoryOpen] = useState(mode === "full");
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 768;

  const handleNewChat = useCallback(() => {
    createSession();
    if (isMobile) setHistoryOpen(false);
  }, [createSession, isMobile]);

  const handleSelectSession = useCallback(
    (id: string) => {
      switchSession(id);
      if (isMobile) setHistoryOpen(false);
    },
    [switchSession, isMobile],
  );

  const handleApproval = useCallback(
    (decision: "approve" | "reject") => {
      submitApproval(decision);
    },
    [submitApproval],
  );

  const messages = currentSession?.messages ?? [];

  if (isInitializing) {
    return (
      <div className={`${styles.container} ${styles[mode]} ${className ?? ""}`}>
        <div className={styles.loading}>載入中…</div>
      </div>
    );
  }

  const showDesktopHistory = mode === "full" && !isMobile && historyOpen;
  const showMobileHistory = isMobile && historyOpen;
  const showTopBar = mode === "full" && isMobile;

  return (
    <div className={`${styles.container} ${styles[mode]} ${className ?? ""}`}>
      {/* Desktop history panel */}
      {mode === "full" && !isMobile && (
        <div className={`${styles.historyColumn} ${showDesktopHistory ? "" : styles.historyCollapsed}`}>
          <ChatHistoryPanel
            sessions={sessions}
            currentSessionId={currentSessionId}
            onSelectSession={handleSelectSession}
            onNewChat={handleNewChat}
            onDeleteSession={deleteSession}
            onRenameSession={renameSession}
            onClose={() => setHistoryOpen(false)}
            showCloseButton
          />
        </div>
      )}

      {/* Mobile history overlay */}
      {showMobileHistory && (
        <div className={styles.mobileHistoryOverlay}>
          <ChatHistoryPanel
            sessions={sessions}
            currentSessionId={currentSessionId}
            onSelectSession={handleSelectSession}
            onNewChat={handleNewChat}
            onDeleteSession={deleteSession}
            onRenameSession={renameSession}
            onClose={() => setHistoryOpen(false)}
            showCloseButton
          />
        </div>
      )}

      {/* Main chat area */}
      <div className={styles.main}>
        {showTopBar && (
          <ChatTopBar
            title={currentSession?.title || "QJudge AI 助教"}
            onToggleHistory={() => setHistoryOpen((v) => !v)}
            onNewChat={handleNewChat}
          />
        )}

        <div className={styles.messagesArea}>
          <MessageList
            messages={messages}
            pendingApproval={pendingApproval}
            onApprovalDecision={handleApproval}
          />
        </div>

        <ComposerBar
          onSend={sendMessage}
          onStop={stopStreaming}
          isStreaming={isStreaming}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create ChatContainer styles**

```scss
// frontend/src/features/chatbot/components/chat-ui/ChatContainer.module.scss
$history-width: 280px;
$motion-duration: 240ms;
$motion-easing: cubic-bezier(0.2, 0, 0.38, 0.9);

.container {
  display: flex;
  height: 100%;
  overflow: hidden;
}

// Full-page mode: blue gradient background on the main chat area
.full .main {
  background:
    radial-gradient(
      ellipse at 15% 50%,
      rgba(69, 137, 255, 0.10) 0%,
      transparent 55%
    ),
    var(--cds-background, #fff);

  :global([data-carbon-theme="g100"]) & {
    background:
      radial-gradient(
        ellipse at 15% 50%,
        rgba(69, 137, 255, 0.15) 0%,
        transparent 55%
      ),
      var(--cds-background, #161616);
  }
}

// Sidebar mode: same gradient
.sidebar {
  background:
    radial-gradient(
      ellipse at 15% 50%,
      rgba(69, 137, 255, 0.10) 0%,
      transparent 55%
    ),
    var(--cds-background, #fff);

  :global([data-carbon-theme="g100"]) & {
    background:
      radial-gradient(
        ellipse at 15% 50%,
        rgba(69, 137, 255, 0.15) 0%,
        transparent 55%
      ),
      var(--cds-background, #161616);
  }
}

.historyColumn {
  width: $history-width;
  flex-shrink: 0;
  transition: width $motion-duration $motion-easing;
  overflow: hidden;
}

.historyCollapsed {
  width: 0;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.messagesArea {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--cds-text-secondary, #525252);
  font-size: 0.875rem;
}

// Mobile history overlay
.mobileHistoryOverlay {
  position: absolute;
  inset: 0;
  z-index: 100;
  background: var(--cds-background, #fff);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/chatbot/components/chat-ui/ChatContainer.tsx \
       frontend/src/features/chatbot/components/chat-ui/ChatContainer.module.scss
git commit -m "feat(chatbot): add ChatContainer composition root with full + sidebar modes"
```

---

## Task 11: Rewrite ChatFullPage

Replace the Carbon `ChatCustomElement` usage with `ChatContainer` in full mode.

**Files:**
- Modify: `frontend/src/features/chatbot/components/ChatFullPage.tsx`
- Modify: `frontend/src/features/chatbot/components/ChatFullPage.module.scss`

- [ ] **Step 1: Rewrite ChatFullPage.tsx**

Replace the entire file content with:

```tsx
// frontend/src/features/chatbot/components/ChatFullPage.tsx
import { ChatContainer } from "./chat-ui/ChatContainer";
import styles from "./ChatFullPage.module.scss";

export default function ChatFullPage() {
  return (
    <ChatContainer mode="full" className={styles.fullPage} />
  );
}
```

- [ ] **Step 2: Rewrite ChatFullPage.module.scss**

Replace the entire file content with:

```scss
// frontend/src/features/chatbot/components/ChatFullPage.module.scss
.fullPage {
  height: 100%;
  width: 100%;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/chatbot/components/ChatFullPage.tsx \
       frontend/src/features/chatbot/components/ChatFullPage.module.scss
git commit -m "refactor(chatbot): rewrite ChatFullPage to use ChatContainer"
```

---

## Task 12: Rewrite ChatbotWidget (Sidebar Mode)

Replace the Carbon web component with `ChatContainer` in sidebar mode. Keep the FAB toggle and sidebar animation logic.

**Files:**
- Modify: `frontend/src/features/chatbot/components/ChatbotWidget.tsx`
- Modify: `frontend/src/features/chatbot/components/ChatbotSidePanel.module.scss` (minor tweaks)

- [ ] **Step 1: Rewrite ChatbotWidget.tsx**

Replace the entire file content with:

```tsx
// frontend/src/features/chatbot/components/ChatbotWidget.tsx
/**
 * ChatbotWidget — Split-view sidebar, teacher/admin only.
 * Uses the custom ChatContainer in sidebar mode.
 */
import { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import AiLaunch from "@carbon/icons-react/es/AiLaunch.js";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { ChatContainer } from "./chat-ui/ChatContainer";
import styles from "./ChatbotSidePanel.module.scss";

export interface ChatbotWidgetProps {
  defaultExpanded?: boolean;
  onProblemUpdated?: () => void;
}

export const ChatbotWidget = ({
  defaultExpanded = false,
  onProblemUpdated,
}: ChatbotWidgetProps) => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isOnChatPage = location.pathname === "/chat";
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 768;
  const [sideBarOpen, setSideBarOpen] = useState(defaultExpanded);

  const isTeacherOrAdmin = user?.role === "teacher" || user?.role === "admin";

  const handleToggle = useCallback(() => {
    if (isMobile) {
      navigate("/chat");
      return;
    }
    setSideBarOpen((prev) => !prev);
  }, [isMobile, navigate]);

  if (!isTeacherOrAdmin || isOnChatPage) return null;

  let className = styles.sidebar;
  if (!sideBarOpen) className += ` ${styles.sidebarClosed}`;

  return (
    <>
      {/* Toggle FAB — only when closed */}
      {!sideBarOpen &&
        createPortal(
          <button
            className={styles.toggleButton}
            onClick={handleToggle}
            aria-label="開啟 AI 助教"
          >
            <AiLaunch size={20} />
          </button>,
          document.body,
        )}

      {/* Sidebar panel */}
      <div className={className}>
        {sideBarOpen && (
          <ChatContainer
            mode="sidebar"
            onProblemUpdated={onProblemUpdated}
            className={styles.chatElement}
          />
        )}
      </div>
    </>
  );
};

export default ChatbotWidget;
```

- [ ] **Step 2: Verify the sidebar SCSS still works**

Read `ChatbotSidePanel.module.scss` — it should work as-is since it uses `.sidebar`, `.sidebarClosed`, `.toggleButton`, `.chatElement` classes. The `sidebarClosing` class can be removed since the new code simplifies the animation (just open/closed). No changes needed if you accept the simplified transition.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/chatbot/components/ChatbotWidget.tsx
git commit -m "refactor(chatbot): rewrite ChatbotWidget to use ChatContainer sidebar mode"
```

---

## Task 13: Remove @carbon/ai-chat Packages and Clean Up

Remove the Carbon AI chat dependencies and delete the old `ChatHistory.tsx`.

**Files:**
- Delete: `frontend/src/features/chatbot/components/ChatHistory.tsx`
- Modify: `frontend/src/features/chatbot/index.ts`
- Modify: `frontend/package.json` (via npm uninstall)

- [ ] **Step 1: Remove packages**

Run:
```bash
cd frontend && npm uninstall @carbon/ai-chat @carbon/ai-chat-components
```

Expected: packages removed from `package.json` and `node_modules`.

- [ ] **Step 2: Delete old ChatHistory.tsx**

```bash
rm frontend/src/features/chatbot/components/ChatHistory.tsx
```

- [ ] **Step 3: Update index.ts exports**

Replace content of `frontend/src/features/chatbot/index.ts`:

```typescript
export { ChatbotWidget } from "./components/ChatbotWidget";
export { ChatContainer } from "./components/chat-ui/ChatContainer";
```

- [ ] **Step 4: Verify no remaining imports of @carbon/ai-chat**

Run:
```bash
grep -r "@carbon/ai-chat" frontend/src/ --include="*.ts" --include="*.tsx"
```

Expected: **no output** (zero matches).

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 6: Verify dev server starts**

Run: `cd frontend && npm run dev`
Expected: Vite dev server starts without build errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(chatbot): remove @carbon/ai-chat, delete old ChatHistory"
```

---

## Verification Checklist

After all tasks are complete:

1. [ ] `npx tsc --noEmit` passes with zero errors
2. [ ] `npm run dev` starts successfully
3. [ ] `grep -r "@carbon/ai-chat" frontend/src/` returns zero results
4. [ ] Full-page chat (`/chat`) renders with history panel (desktop) or top bar (mobile)
5. [ ] Sidebar widget renders for teacher/admin users, FAB toggle works
6. [ ] Sending a message triggers SSE stream and renders incrementally
7. [ ] CoT steps display in Accordion
8. [ ] Thinking/reasoning block displays and is collapsible
9. [ ] IME input (中文) works correctly — Enter during composition does NOT send
10. [ ] History panel: sessions load, select, rename, delete all work
