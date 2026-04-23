// frontend/src/features/chatbot/contexts/ChatSessionContext.tsx
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { ChatSession } from "@/core/types/chatbot.types";
import { chatbotRepository } from "@/infrastructure/api/repositories";
import { useAuth } from "@/features/auth/contexts/AuthContext";

interface ActiveSessionRequest {
  id: string;
  nonce: number;
}

interface ChatSessionContextValue {
  sessions: ChatSession[];
  isLoadingSessions: boolean;
  refreshSessions: () => Promise<void>;
  /** 其他流程（如批改）建立 session 後，用這個通知已掛載的 ChatContainer 切到該 session。 */
  activeSessionRequest: ActiveSessionRequest | null;
  requestActiveSession: (id: string) => void;
}

const ChatSessionContext = createContext<ChatSessionContextValue | undefined>(undefined);

export function ChatSessionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isTeacherOrAdmin = user?.role === "teacher" || user?.role === "admin";

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [activeSessionRequest, setActiveSessionRequest] = useState<ActiveSessionRequest | null>(null);
  const activeSessionRequestNonceRef = useRef(0);

  const refreshSessions = useCallback(async () => {
    if (!isTeacherOrAdmin) return;
    setIsLoadingSessions(true);
    try {
      const result = await chatbotRepository.getSessions();
      setSessions(result);
    } catch {
      // silently fail — SideMenu will show empty list
    } finally {
      setIsLoadingSessions(false);
    }
  }, [isTeacherOrAdmin]);

  const requestActiveSession = useCallback((id: string) => {
    activeSessionRequestNonceRef.current += 1;
    setActiveSessionRequest({ id, nonce: activeSessionRequestNonceRef.current });
  }, []);

  useEffect(() => {
    if (isTeacherOrAdmin) {
      void refreshSessions();
    }
  }, [isTeacherOrAdmin, refreshSessions]);

  return (
    <ChatSessionContext.Provider
      value={{
        sessions,
        isLoadingSessions,
        refreshSessions,
        activeSessionRequest,
        requestActiveSession,
      }}
    >
      {children}
    </ChatSessionContext.Provider>
  );
}

export function useChatSessionContext() {
  const ctx = useContext(ChatSessionContext);
  if (ctx === undefined) {
    throw new Error("useChatSessionContext must be used within ChatSessionProvider");
  }
  return ctx;
}
