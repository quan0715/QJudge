import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useChatbot } from "../hooks/useChatbot";
import { useChatSessionContext } from "./ChatSessionContext";
import { ArtifactPanelProvider } from "./ArtifactPanelContext";

type ChatbotContextValue = ReturnType<typeof useChatbot>;

const ChatbotContext = createContext<ChatbotContextValue | null>(null);

export function ChatbotProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const enabled = !!user;
  const chatbot = useChatbot({ enabled });

  const { activeSessionRequest } = useChatSessionContext();

  // 用 ref 持有最新的 chatbot state，effect 本身只依賴 activeSessionRequest。
  // 先前直接把 chatbot.sessions/switchSession 等放進 deps，會因為它們每 render 就換 reference 導致
  // effect 每次重跑，配合未滿足 guard 的瞬間會對後端同一個 endpoint 灌出大量請求。
  const chatbotRef = useRef(chatbot);
  useEffect(() => {
    chatbotRef.current = chatbot;
  });
  const handledRequestRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeSessionRequest) {
      handledRequestRef.current = null;
      return;
    }
    const requestedSessionId = activeSessionRequest.id;
    const requestKey = `${requestedSessionId}:${activeSessionRequest.nonce}`;
    if (handledRequestRef.current === requestKey) return;

    const current = chatbotRef.current;
    if (current.isInitializing) return;
    if (current.currentSessionId === requestedSessionId && current.currentSession) {
      handledRequestRef.current = requestKey;
      return;
    }
    handledRequestRef.current = requestKey;
    const inList = current.sessions.some((s) => s.id === requestedSessionId);
    if (!inList) {
      if (
        requestedSessionId.startsWith("temp-") &&
        current.currentSessionId &&
        !current.currentSessionId.startsWith("temp-")
      ) {
        return;
      }
      void current.refreshSessions();
    }
    void current.switchSession(requestedSessionId);
  }, [activeSessionRequest, chatbot.isInitializing]);

  return (
    <ChatbotContext.Provider value={chatbot}>
      <ArtifactPanelProvider sessionId={chatbot.currentSessionId}>
        {children}
      </ArtifactPanelProvider>
    </ChatbotContext.Provider>
  );
}

export function useChatbotContext(): ChatbotContextValue {
  const ctx = useContext(ChatbotContext);
  if (!ctx) {
    throw new Error("useChatbotContext must be used within <ChatbotProvider>");
  }
  return ctx;
}

export function useOptionalChatbotContext(): ChatbotContextValue | null {
  return useContext(ChatbotContext);
}
