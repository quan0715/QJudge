// frontend/src/features/chatbot/contexts/ChatSessionContext.tsx
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { ChatSession } from "@/core/types/chatbot.types";
import { chatbotRepository } from "@/infrastructure/api/repositories";
import { useAuth } from "@/features/auth/contexts/AuthContext";

interface ChatSessionContextValue {
  sessions: ChatSession[];
  isLoadingSessions: boolean;
  refreshSessions: () => Promise<void>;
}

const ChatSessionContext = createContext<ChatSessionContextValue | undefined>(undefined);

export function ChatSessionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isTeacherOrAdmin = user?.role === "teacher" || user?.role === "admin";

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

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

  useEffect(() => {
    if (isTeacherOrAdmin) {
      void refreshSessions();
    }
  }, [isTeacherOrAdmin, refreshSessions]);

  return (
    <ChatSessionContext.Provider value={{ sessions, isLoadingSessions, refreshSessions }}>
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
