/**
 * ChatbotWidget — Carbon AI Chat replacement
 *
 * Wraps @carbon/ai-chat ChatContainer and bridges to the QJudge
 * backend SSE stream (DeepAgents / LangGraph).
 *
 * Props are backward-compatible with the old ChatbotWidget.
 */
import { useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  ChatContainer,
  BusEventType,
  WriteableElementName,
  MessageResponseTypes,
  ChainOfThoughtStepStatus,
  type ChatInstance,
  type HistoryItem,
  type ChainOfThoughtStep,
  type CustomSendMessageOptions,
  type MessageRequest,
  type StreamChunk,
  type ReasoningStep,
} from "@carbon/ai-chat";
import { chatbotRepository } from "@/infrastructure/api/repositories";
import { httpClient } from "@/infrastructure/api/http.client";
import type { BackgroundInformation, ChatSession } from "@/core/types/chatbot.types";

// ── SSE event shape from ai-service ──────────────────────────────────────
interface V2StreamEvent {
  type:
    | "run_started"
    | "agent_message_delta"
    | "thinking_delta"
    | "tool_call_started"
    | "tool_call_finished"
    | "run_completed"
    | "run_failed";
  thread_id?: string;
  content?: string;
  tool_name?: string;
  tool_call_id?: string;
  input_data?: Record<string, unknown>;
  result?: string | Record<string, unknown>;
  is_error?: boolean;
  message?: string;
}

const BASE_URL = "/api/v1/ai/sessions";

// ── Map backend session messages to Carbon HistoryItem[] ─────────────────
function sessionToHistoryItems(session: ChatSession): HistoryItem[] {
  return session.messages.map((msg) => ({
    message:
      msg.role === "user"
        ? { input: { text: msg.content }, id: msg.id }
        : {
            id: msg.id,
            output: {
              generic: [
                {
                  response_type: MessageResponseTypes.TEXT,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  text: msg.content,
                } as any,
              ],
            },
          },
    time: msg.timestamp.toISOString(),
  }));
}

// ── History panel ─────────────────────────────────────────────────────────
interface HistoryPanelContentProps {
  instanceRef: React.MutableRefObject<ChatInstance | null>;
  sessionsRef: React.MutableRefObject<{ id: string; title: string; updatedAt: Date }[]>;
  currentSessionIdRef: React.MutableRefObject<string | null>;
  backendSessionIdRef: React.MutableRefObject<string | null>;
}

function HistoryPanelContent({
  instanceRef,
  sessionsRef,
  currentSessionIdRef,
  backendSessionIdRef,
}: HistoryPanelContentProps) {
  const handleClick = useCallback(
    async (sessionId: string) => {
      const instance = instanceRef.current;
      if (!instance) return;
      currentSessionIdRef.current = sessionId;
      backendSessionIdRef.current = sessionId;
      try { localStorage.setItem("chatbot_last_session_id", sessionId); } catch { /* ignore */ }
      try {
        const full = await chatbotRepository.getSession(sessionId);
        const items = sessionToHistoryItems(full);
        await instance.messaging.restartConversation();
        await new Promise((r) => setTimeout(r, 200));
        if (items.length > 0) await instance.messaging.insertHistory(items);
      } catch (err) {
        console.warn("Failed to load session history:", err);
      }
    },
    [instanceRef, currentSessionIdRef, backendSessionIdRef],
  );

  const sessions = sessionsRef.current;

  if (sessions.length === 0) {
    return (
      <div
        style={{
          padding: "1rem",
          fontSize: "0.875rem",
          color: "var(--cds-text-secondary, #525252)",
        }}
      >
        尚無對話記錄
      </div>
    );
  }

  return (
    <div style={{ overflowY: "auto", maxHeight: "100%" }}>
      {sessions.map((s) => (
        <button
          key={s.id}
          onClick={() => handleClick(s.id)}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            padding: "0.75rem 1rem",
            borderBottom: "1px solid var(--cds-border-subtle-01, #e0e0e0)",
            background:
              s.id === currentSessionIdRef.current
                ? "var(--cds-layer-selected, #e8e8e8)"
                : "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          <div
            style={{
              fontSize: "0.875rem",
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {s.title || "新對話"}
          </div>
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--cds-text-secondary, #525252)",
              marginTop: "0.125rem",
            }}
          >
            {s.updatedAt.toLocaleDateString("zh-TW")}
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Props (backward-compatible) ───────────────────────────────────────────
export interface ChatbotWidgetProps {
  defaultExpanded?: boolean;
  /** Ignored in Carbon mode — both usages render as a float widget */
  embedded?: boolean;
  problemContext?: { id: number | string; title: string } | null;
  backgroundInfo?: BackgroundInformation | null;
  onProblemUpdated?: () => void;
}

// ── Main component ────────────────────────────────────────────────────────
export const ChatbotWidget = ({
  defaultExpanded = false,
  backgroundInfo = null,
  onProblemUpdated = undefined,
}: ChatbotWidgetProps) => {
  const instanceRef = useRef<ChatInstance | null>(null);
  const backendSessionIdRef = useRef<string | null>(null);
  const sessionsRef = useRef<{ id: string; title: string; updatedAt: Date }[]>([]);
  const currentSessionIdRef = useRef<string | null>(null);

  // ── customSendMessage: SSE bridge ─────────────────────────────────────
  const customSendMessage = useCallback(
    async (
      req: MessageRequest,
      opts: CustomSendMessageOptions,
      instance: ChatInstance,
    ) => {
      instance.input.updateRawValue(() => "");

      const text = (req.input as { text?: string }).text?.trim() ?? "";
      const responseId = crypto.randomUUID();
      const textItemId = "item-text";

      // Create backend session on first message
      let sessionId = backendSessionIdRef.current;
      if (!sessionId) {
        const created = await chatbotRepository.createBackendSession();
        sessionId = created.id;
        backendSessionIdRef.current = sessionId;
        currentSessionIdRef.current = sessionId;
      }

      const payload: Record<string, unknown> = {
        content: text,
      };

      const response = await httpClient.request(
        `${BASE_URL}/${sessionId}/send_message_stream/`,
        {
          method: "POST",
          body: JSON.stringify(payload),
          headers: {
            "Content-Type": "application/json",
            "X-QJudge-Agent-Contract": "v2",
          },
          signal: opts.signal,
        },
      );

      if (!response.ok) {
        throw new Error(
          response.status === 401 ? "請先登入" : `HTTP ${response.status}`,
        );
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedText = "";
      let accumulatedThinking = "";
      const cotSteps: ChainOfThoughtStep[] = [];
      const reasoningSteps: ReasoningStep[] = [];
      let isCanceled = false;

      // Listen for abort (stop button / conversation restart)
      const abortHandler = () => { isCanceled = true; };
      opts.signal?.addEventListener("abort", abortHandler);

      // Build message_options snapshot for partial/final chunks
      const buildMessageOptions = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const opts: Record<string, any> = {};
        if (cotSteps.length > 0) opts.chain_of_thought = [...cotSteps];
        if (reasoningSteps.length > 0) opts.reasoning = { steps: [...reasoningSteps] };
        else if (accumulatedThinking) opts.reasoning = { content: accumulatedThinking };
        return Object.keys(opts).length > 0 ? opts : undefined;
      };

      // Send a partial chunk (delta text or just a CoT/reasoning update)
      const sendPartial = async (delta?: string) => {
        if (delta) accumulatedText += delta;
        const msgOpts = buildMessageOptions();
        await instance.messaging.addMessageChunk({
          partial_item: {
            response_type: MessageResponseTypes.TEXT,
            text: delta ?? "",
            streaming_metadata: { id: textItemId, cancellable: true },
          },
          streaming_metadata: { response_id: responseId },
          ...(msgOpts ? { partial_response: { message_options: msgOpts } } : {}),
        } as StreamChunk);
      };

      // Finalize the message (complete_item → final_response)
      const sendFinal = async (stopped: boolean) => {
        const msgOpts = buildMessageOptions();
        const completeItem = {
          response_type: MessageResponseTypes.TEXT,
          text: accumulatedText,
          streaming_metadata: { id: textItemId, ...(stopped ? { stream_stopped: true } : {}) },
        };

        // Step 1: complete_item
        await instance.messaging.addMessageChunk({
          complete_item: completeItem,
          streaming_metadata: { response_id: responseId },
        } as StreamChunk);

        // Step 2: final_response
        const finalChunk: StreamChunk = {
          final_response: {
            id: responseId,
            output: { generic: [completeItem] },
            ...(msgOpts ? { message_options: msgOpts } : {}),
          },
        };
        await instance.messaging.addMessageChunk(finalChunk);
      };

      const handleEvent = async (event: V2StreamEvent) => {
        if (isCanceled) return;

        switch (event.type) {
          case "run_started":
            if (event.thread_id) {
              backendSessionIdRef.current = event.thread_id;
              currentSessionIdRef.current = event.thread_id;
            }
            break;

          case "thinking_delta":
            if (event.content) {
              accumulatedThinking += event.content;
              // Stream thinking as reasoning content
              await instance.messaging.addMessageChunk({
                partial_item: {
                  response_type: MessageResponseTypes.TEXT,
                  text: "",
                  streaming_metadata: { id: textItemId, cancellable: true },
                },
                partial_response: {
                  message_options: { reasoning: { content: accumulatedThinking } },
                },
                streaming_metadata: { response_id: responseId },
              } as StreamChunk);
            }
            break;

          case "agent_message_delta":
            if (event.content) await sendPartial(event.content);
            break;

          case "tool_call_started":
            if (event.tool_name) {
              cotSteps.push({
                title: event.tool_name,
                tool_name: event.tool_name,
                status: ChainOfThoughtStepStatus.PROCESSING,
                request: event.input_data
                  ? { args: event.input_data }
                  : undefined,
              });
              await sendPartial();
            }
            break;

          case "tool_call_finished": {
            let idx = -1;
            for (let i = cotSteps.length - 1; i >= 0; i--) {
              if (cotSteps[i].status === ChainOfThoughtStepStatus.PROCESSING) { idx = i; break; }
            }
            if (idx >= 0) {
              cotSteps[idx] = {
                ...cotSteps[idx],
                status: event.is_error
                  ? ChainOfThoughtStepStatus.FAILURE
                  : ChainOfThoughtStepStatus.SUCCESS,
                response: event.result
                  ? {
                      content:
                        typeof event.result === "string"
                          ? event.result
                          : JSON.stringify(event.result, null, 2),
                    }
                  : undefined,
              };
            }
            await sendPartial();
            break;
          }

          case "run_completed": {
            await sendFinal(false);
            onProblemUpdated?.();
            chatbotRepository.getSessions().then((sessions) => {
              sessionsRef.current = sessions.map((s) => ({
                id: s.id,
                title: s.title,
                updatedAt: s.updatedAt,
              }));
            }).catch(console.warn);
            break;
          }

          case "run_failed":
            throw new Error(event.message || "Agent 執行失敗");
        }
      };

      try {
        // Parse SSE stream
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const rawLine of lines) {
            const line = rawLine.trimEnd();
            if (!line.startsWith("data: ")) continue;
            await handleEvent(JSON.parse(line.slice(6)));
          }
        }
        // Flush remaining buffer
        if (buffer.trim().startsWith("data: ")) {
          try {
            await handleEvent(JSON.parse(buffer.trim().slice(6)));
          } catch { /* ignore trailing parse errors */ }
        }
      } catch (err) {
        // If aborted (stop button / restart), finalize with stream_stopped
        if (isCanceled) {
          await sendFinal(true);
          return;
        }
        throw err;
      } finally {
        opts.signal?.removeEventListener("abort", abortHandler);
      }
    },
    [backgroundInfo, onProblemUpdated],
  );

  // ── customLoadHistory: restore most recent session ───────────────────
  const customLoadHistory = useCallback(
    async (_instance: ChatInstance): Promise<HistoryItem[]> => {
      try {
        const sessions = await chatbotRepository.getSessions();
        sessionsRef.current = sessions.map((s) => ({
          id: s.id,
          title: s.title,
          updatedAt: s.updatedAt,
        }));
        if (sessions.length === 0) return [];

        let targetId: string | null = null;
        try { targetId = localStorage.getItem("chatbot_last_session_id"); } catch { /* ignore */ }

        const session = sessions.find((s) => s.id === targetId) ?? sessions[0];
        backendSessionIdRef.current = session.id;
        currentSessionIdRef.current = session.id;

        const full = await chatbotRepository.getSession(session.id);
        return sessionToHistoryItems(full);
      } catch {
        return [];
      }
    },
    [],
  );

  // ── Stable config refs (prevent identity churn) ──────────────────────
  const messagingConfig = useRef({
    customSendMessage,
    showStopButtonImmediately: true,
    messageTimeoutSecs: 60,
    customLoadHistory,
  }).current;

  const historyConfig = useRef({ isOn: true }).current;
  const headerConfig = useRef({ title: "QJudge AI 助教" }).current;
  const launcherConfig = useRef({ isOn: true }).current;

  const renderWriteableElements = useRef({
    [WriteableElementName.HISTORY_PANEL_ELEMENT]: (
      <HistoryPanelContent
        instanceRef={instanceRef}
        sessionsRef={sessionsRef}
        currentSessionIdRef={currentSessionIdRef}
        backendSessionIdRef={backendSessionIdRef}
      />
    ),
  }).current;

  const handleBeforeRender = useCallback((instance: ChatInstance) => {
    instanceRef.current = instance;
    instance.on({
      type: BusEventType.SEND,
      handler: () => {
        try {
          if (backendSessionIdRef.current) {
            localStorage.setItem("chatbot_last_session_id", backendSessionIdRef.current);
          }
        } catch { /* ignore */ }
      },
    });
  }, []);

  return createPortal(
    <ChatContainer
      openChatByDefault={defaultExpanded}
      header={headerConfig}
      launcher={launcherConfig}
      messaging={messagingConfig}
      history={historyConfig}
      assistantName="QJudge AI"
      renderWriteableElements={renderWriteableElements}
      onBeforeRender={handleBeforeRender}
    />,
    document.body,
  );
};

export default ChatbotWidget;
