/**
 * ChatbotWidget — Split-view sidebar powered by @carbon/ai-chat.
 *
 * Follows the official Carbon `workspace-sidebar` example pattern:
 * - ChatCustomElement with CornersType.SQUARE
 * - instance.changeView() to toggle open/close
 * - onViewChange / onViewPreChange for state sync
 * - AiLaunch icon from @carbon/icons-react
 *
 * Only visible for teacher/admin roles.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChatCustomElement,
  BusEventType,
  ButtonItemKind,
  ButtonItemType,
  WriteableElementName,
  MessageResponseTypes,
  ChainOfThoughtStepStatus,
  CornersType,
  ViewType,
  type BusEventMessageItemCustom,
  type ButtonItem,
  type CardItem,
  type ChatInstance,
  type HistoryItem,
  type ChainOfThoughtStep,
  type CustomSendMessageOptions,
  type MessageRequest,
  type StreamChunk,
  type PublicConfig,
  type BusEventViewChange,
  type BusEventViewPreChange,
} from "@carbon/ai-chat";
import AiLaunch from "@carbon/icons-react/es/AiLaunch.js";
import { useLocation, useNavigate } from "react-router-dom";
import { chatbotRepository } from "@/infrastructure/api/repositories";
import { httpClient } from "@/infrastructure/api/http.client";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { ChatHistory } from "./ChatHistory";
import type { ChatSession } from "@/core/types/chatbot.types";
import styles from "./ChatbotSidePanel.module.scss";

// ── SSE event shape from ai-service ──────────────────────────────────────
interface V2StreamEvent {
  type: string;
  thread_id?: string;
  content?: string;
  tool_name?: string;
  tool_call_id?: string;
  input_data?: Record<string, unknown>;
  result?: string | Record<string, unknown>;
  is_error?: boolean;
  message?: string;
  // awaiting_approval fields
  action_requests?: Array<{ name: string; args?: Record<string, unknown> }>;
  review_configs?: Array<{ action_name: string; allowed_decisions: string[] }>;
}

// user_defined payload embedded in HITL approval buttons
interface HitlButtonData {
  decision: "approve" | "reject";
  sessionId: string;
}

const BASE_URL = "/api/v1/ai/sessions";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Map backend session → Carbon HistoryItem[] ───────────────────────────
function sessionToHistoryItems(session: ChatSession): HistoryItem[] {
  return session.messages.map((msg) => ({
    message:
      msg.role === "user"
        ? { input: { text: msg.content }, id: msg.id }
        : {
            id: msg.id,
            output: {
              generic: [{ response_type: MessageResponseTypes.TEXT, text: msg.content } as any],
            },
          },
    time: msg.timestamp.toISOString(),
  }));
}

// ── Props ─────────────────────────────────────────────────────────────────
export interface ChatbotWidgetProps {
  defaultExpanded?: boolean;
  onProblemUpdated?: () => void;
}

// ── Main component ────────────────────────────────────────────────────────
export const ChatbotWidget = ({
  defaultExpanded = false,
  onProblemUpdated = undefined,
}: ChatbotWidgetProps) => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isOnChatPage = location.pathname === "/chat";
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 768;
  const [instance, setInstance] = useState<ChatInstance | null>(null);
  const [sideBarOpen, setSideBarOpen] = useState(defaultExpanded);
  const [sideBarClosing, setSideBarClosing] = useState(false);
  const [clickInProgress, setClickInProgress] = useState(false);
  const backendSessionIdRef = useRef<string | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const instanceRef = useRef<ChatInstance | null>(null);
  // Prevent double-firing when multiple HITL buttons exist in chat history
  const approvalInProgressRef = useRef(false);

  const isTeacherOrAdmin = user?.role === "teacher" || user?.role === "admin";

  // ── customSendMessage: SSE bridge ─────────────────────────────────────
  // Following the official Carbon basic example pattern:
  // - NOT async (no long-lived Promise that blocks input clearing)
  // - Streaming uses addMessageChunk which works independently of the Promise
  // - Signal listener handles cancellation
  const customSendMessage = useCallback(
    (req: MessageRequest, opts: CustomSendMessageOptions, inst: ChatInstance) => {
      const text = (req.input as { text?: string }).text?.trim() ?? "";

      // Carbon sends an empty welcome/hydrate request on init — respond locally
      if (!text) {
        inst.messaging.addMessage({
          output: {
            generic: [{
              response_type: MessageResponseTypes.TEXT,
              text: "你好！我是 QJudge AI 助教，有什麼可以幫你的嗎？",
            }],
          },
        });
        return;
      }

      const responseId = crypto.randomUUID();
      const textItemId = "item-text";
      let accText = "";
      let accThinking = "";
      const cotSteps: ChainOfThoughtStep[] = [];
      let isCanceled = false;

      const abortHandler = () => { isCanceled = true; };
      opts.signal?.addEventListener("abort", abortHandler);

      const buildMsgOpts = () => {
        const o: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (cotSteps.length) o.chain_of_thought = [...cotSteps];
        if (accThinking) o.reasoning = { content: accThinking };
        return Object.keys(o).length ? o : undefined;
      };

      const sendPartial = (delta?: string) => {
        if (delta) accText += delta;
        const mo = buildMsgOpts();
        inst.messaging.addMessageChunk({
          partial_item: { response_type: MessageResponseTypes.TEXT, text: delta ?? "", streaming_metadata: { id: textItemId, cancellable: true } },
          streaming_metadata: { response_id: responseId },
          ...(mo ? { partial_response: { message_options: mo } } : {}),
        } as StreamChunk);
      };

      const sendFinal = (stopped: boolean) => {
        const mo = buildMsgOpts();
        const item = { response_type: MessageResponseTypes.TEXT, text: accText, streaming_metadata: { id: textItemId, ...(stopped ? { stream_stopped: true } : {}) } };
        inst.messaging.addMessageChunk({ complete_item: item, streaming_metadata: { response_id: responseId } } as StreamChunk);
        inst.messaging.addMessageChunk({ final_response: { id: responseId, output: { generic: [item] }, ...(mo ? { message_options: mo } : {}) } } as StreamChunk);
      };

      const handleEvent = (e: V2StreamEvent) => {
        if (isCanceled) return;
        switch (e.type) {
          case "run_started":
            if (e.thread_id) { backendSessionIdRef.current = e.thread_id; currentSessionIdRef.current = e.thread_id; }
            break;
          case "thinking_delta":
            if (e.content) {
              accThinking += e.content;
              inst.messaging.addMessageChunk({
                partial_item: { response_type: MessageResponseTypes.TEXT, text: "", streaming_metadata: { id: textItemId, cancellable: true } },
                partial_response: { message_options: { reasoning: { content: accThinking } } },
                streaming_metadata: { response_id: responseId },
              } as StreamChunk);
            }
            break;
          case "agent_message_delta":
            if (e.content) sendPartial(e.content);
            break;
          case "tool_call_started":
            if (e.tool_name) {
              cotSteps.push({ title: e.tool_name, tool_name: e.tool_name, status: ChainOfThoughtStepStatus.PROCESSING, request: e.input_data ? { args: e.input_data } : undefined });
              sendPartial();
            }
            break;
          case "tool_call_finished": {
            let i = cotSteps.length - 1;
            for (; i >= 0; i--) if (cotSteps[i].status === ChainOfThoughtStepStatus.PROCESSING) break;
            if (i >= 0) cotSteps[i] = { ...cotSteps[i], status: e.is_error ? ChainOfThoughtStepStatus.FAILURE : ChainOfThoughtStepStatus.SUCCESS, response: e.result ? { content: typeof e.result === "string" ? e.result : JSON.stringify(e.result, null, 2) } : undefined };
            sendPartial();
            break;
          }
          case "run_completed":
            sendFinal(false);
            onProblemUpdated?.();
            break;
          case "run_failed":
            console.error("[ChatbotWidget] Agent error:", e.message);
            sendFinal(true);
            break;
          case "awaiting_approval": {
            // Agent paused for human approval — finalize stream, then inject a
            // Carbon CardItem with approve/reject buttons into the chat.
            sendFinal(false);
            const sid = backendSessionIdRef.current;
            if (!sid || !e.action_requests?.length) break;

            const toolName = e.action_requests[0].name;
            const argsStr = JSON.stringify(e.action_requests[0].args ?? {}, null, 2);

            const approveBtn: ButtonItem = {
              response_type: MessageResponseTypes.BUTTON,
              button_type: ButtonItemType.CUSTOM_EVENT,
              custom_event_name: "hitl_decision",
              label: "確認執行",
              kind: ButtonItemKind.DEFAULT,
              user_defined: { decision: "approve", sessionId: sid } satisfies HitlButtonData,
            };
            const rejectBtn: ButtonItem = {
              response_type: MessageResponseTypes.BUTTON,
              button_type: ButtonItemType.CUSTOM_EVENT,
              custom_event_name: "hitl_decision",
              label: "取消",
              kind: ButtonItemKind.DANGER,
              user_defined: { decision: "reject", sessionId: sid } satisfies HitlButtonData,
            };
            const card: CardItem = {
              response_type: MessageResponseTypes.CARD,
              body: [{
                response_type: MessageResponseTypes.TEXT,
                text: `**工具呼叫確認：\`${toolName}\`**\n\`\`\`json\n${argsStr}\n\`\`\``,
              }],
              footer: [approveBtn, rejectBtn],
            };

            inst.messaging.addMessage({
              output: { generic: [card] },
            });
            break;
          }
        }
      };

      // Start streaming — async but NOT awaited (fire-and-forget)
      // Carbon manages message lifecycle via addMessageChunk calls above
      (async () => {
        let sessionId = backendSessionIdRef.current;
        if (!sessionId) {
          const created = await chatbotRepository.createBackendSession();
          sessionId = created.id;
          backendSessionIdRef.current = sessionId;
          currentSessionIdRef.current = sessionId;
        }

        const response = await httpClient.request(`${BASE_URL}/${sessionId}/send_message_stream/`, {
          method: "POST",
          body: JSON.stringify({ content: text }),
          headers: { "Content-Type": "application/json", "X-QJudge-Agent-Contract": "v2" },
          signal: opts.signal,
        });
        if (!response.ok) throw new Error(response.status === 401 ? "請先登入" : `HTTP ${response.status}`);

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const raw of lines) {
            const l = raw.trimEnd();
            if (l.startsWith("data: ")) {
              try { handleEvent(JSON.parse(l.slice(6))); } catch { /* parse error */ }
            }
          }
        }
        if (buffer.trim().startsWith("data: ")) {
          try { handleEvent(JSON.parse(buffer.trim().slice(6))); } catch { /* */ }
        }
      })().catch((err) => {
        if (isCanceled) { sendFinal(true); return; }
        console.error("[ChatbotWidget] Stream error:", err);
        sendFinal(true);
      }).finally(() => {
        opts.signal?.removeEventListener("abort", abortHandler);
      });
    }, [onProblemUpdated],
  );

  const customLoadHistory = useCallback(async (_inst: ChatInstance): Promise<HistoryItem[]> => {
    try {
      const sessions = await chatbotRepository.getSessions();
      if (!sessions.length) return [];
      let targetId: string | null = null;
      try { targetId = localStorage.getItem("chatbot_last_session_id"); } catch { /* */ }
      const session = sessions.find(s => s.id === targetId) ?? sessions[0];
      backendSessionIdRef.current = session.id;
      currentSessionIdRef.current = session.id;
      return sessionToHistoryItems(await chatbotRepository.getSession(session.id));
    } catch { return []; }
  }, []);

  // ── Carbon config (stable refs) ────────────────────────────────────────
  const config = useRef<PublicConfig>({
    messaging: { customSendMessage, showStopButtonImmediately: true, messageTimeoutSecs: 120, customLoadHistory },
    history: { isOn: true },
    header: { title: "QJudge AI 助教" },
    layout: { corners: CornersType.SQUARE },
    openChatByDefault: true,
    assistantName: "QJudge AI",
  }).current;

  // Session management for ChatHistory
  const handleSessionSelect = useCallback((sessionId: string) => {
    backendSessionIdRef.current = sessionId;
    currentSessionIdRef.current = sessionId;
    setCurrentSessionId(sessionId);
    try { localStorage.setItem("chatbot_last_session_id", sessionId); } catch { /* */ }
  }, []);

  const handleNewChat = useCallback(() => {
    backendSessionIdRef.current = null;
    currentSessionIdRef.current = null;
    setCurrentSessionId(null);
  }, []);

  // ── HITL approval handler (called from MESSAGE_ITEM_CUSTOM bus event) ──
  const handleApproval = useCallback(async (decision: "approve" | "reject", sessionId: string) => {
    const inst = instanceRef.current;
    if (!inst || approvalInProgressRef.current) return;

    approvalInProgressRef.current = true;

    const responseId = crypto.randomUUID();
    const textItemId = "item-text-resume";
    let accText = "";

    const sendPartial = (delta: string) => {
      accText += delta;
      inst.messaging.addMessageChunk({
        partial_item: { response_type: MessageResponseTypes.TEXT, text: delta, streaming_metadata: { id: textItemId, cancellable: false } },
        streaming_metadata: { response_id: responseId },
      } as StreamChunk);
    };

    const sendFinal = (stopped: boolean) => {
      const item = { response_type: MessageResponseTypes.TEXT, text: accText, streaming_metadata: { id: textItemId, ...(stopped ? { stream_stopped: true } : {}) } };
      inst.messaging.addMessageChunk({ complete_item: item, streaming_metadata: { response_id: responseId } } as StreamChunk);
      inst.messaging.addMessageChunk({ final_response: { id: responseId, output: { generic: [item] } } } as StreamChunk);
    };

    try {
      const response = await httpClient.request(`${BASE_URL}/${sessionId}/resume_stream/`, {
        method: "POST",
        body: JSON.stringify({ decision }),
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const raw of lines) {
          const l = raw.trimEnd();
          if (l.startsWith("data: ")) {
            try {
              const ev: V2StreamEvent = JSON.parse(l.slice(6));
              if (ev.type === "agent_message_delta" && ev.content) sendPartial(ev.content);
              if (ev.type === "run_completed") { sendFinal(false); onProblemUpdated?.(); }
              if (ev.type === "run_failed") sendFinal(true);
            } catch { /* parse error */ }
          }
        }
      }
    } catch (err) {
      console.error("[ChatbotWidget] Resume error:", err);
      sendFinal(true);
    } finally {
      approvalInProgressRef.current = false;
    }
  }, [onProblemUpdated]);

  const renderWriteableElements = useMemo(() => {
    if (!instance) return {};
    return {
      [WriteableElementName.HISTORY_PANEL_ELEMENT]: (
        <ChatHistory
          instance={instance}
          currentSessionId={currentSessionId}
          onSessionSelect={handleSessionSelect}
          onNewChat={handleNewChat}
        />
      ),
    };
  }, [instance, currentSessionId, handleSessionSelect, handleNewChat]);

  // ── Carbon lifecycle callbacks ─────────────────────────────────────────
  // Stable ref so the bus event handler always calls the latest handleApproval
  const handleApprovalRef = useRef(handleApproval);
  handleApprovalRef.current = handleApproval;

  const onBeforeRender = useCallback((inst: ChatInstance) => {
    setInstance(inst);
    instanceRef.current = inst;

    inst.on({ type: BusEventType.SEND, handler: () => {
      try { if (backendSessionIdRef.current) localStorage.setItem("chatbot_last_session_id", backendSessionIdRef.current); } catch { /* */ }
    }});

    // HITL: listen for approve/reject button clicks from CardItem footers
    inst.on({ type: BusEventType.MESSAGE_ITEM_CUSTOM, handler: (event: BusEventMessageItemCustom) => {
      if (event.messageItem.custom_event_name === "hitl_decision") {
        const ud = event.messageItem.user_defined as HitlButtonData;
        handleApprovalRef.current(ud.decision, ud.sessionId);
      }
    }});
  }, []);

  const onViewChange = useCallback((event: BusEventViewChange) => {
    if (event.newViewState.mainWindow) {
      setSideBarOpen(true);
    } else {
      setSideBarOpen(false);
      setSideBarClosing(false);
    }
  }, []);

  const onViewPreChange = useCallback(async (event: BusEventViewPreChange) => {
    if (!event.newViewState.mainWindow) {
      setSideBarClosing(true);
      await sleep(250); // allow CSS transition
    }
  }, []);

  const handleToggle = useCallback(async () => {
    if (!instance || clickInProgress) return;
    setClickInProgress(true);
    try {
      const state = instance.getState();
      if (state.viewState.mainWindow) {
        await instance.changeView(ViewType.LAUNCHER);
      } else {
        await instance.changeView(ViewType.MAIN_WINDOW);
      }
    } finally { setClickInProgress(false); }
  }, [instance, clickInProgress]);

  if (!isTeacherOrAdmin || isOnChatPage) return null;

  // Build sidebar className
  let className = styles.sidebar;
  if (sideBarClosing) className += ` ${styles.sidebarClosing}`;
  else if (!sideBarOpen) className += ` ${styles.sidebarClosed}`;

  return (
    <>
      {/* Toggle FAB — only when closed and not on /chat page */}
      {!sideBarOpen && createPortal(
        <button className={styles.toggleButton} onClick={isMobile ? () => navigate("/chat") : handleToggle} disabled={clickInProgress} aria-label="開啟 AI 助教">
          <AiLaunch size={20} />
        </button>,
        document.body,
      )}

      {/* Sidebar panel (inline flex child of MainLayout) */}
      <div className={className}>
        <ChatCustomElement
          className={styles.chatElement}
          {...config}
          onBeforeRender={onBeforeRender}
          onViewChange={onViewChange}
          onViewPreChange={onViewPreChange}
          renderWriteableElements={renderWriteableElements}
        />
      </div>
    </>
  );
};

export default ChatbotWidget;
