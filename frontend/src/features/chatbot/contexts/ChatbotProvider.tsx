import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { CopilotProvider } from "@/shared/copilot";
import { BrowserCopilotStorage } from "@/infrastructure/copilot/browserCopilotStorage";
import { createQJudgeCopilotTransport } from "@/infrastructure/copilot/qJudgeCopilotTransport";
import { chatbotRepository } from "@/infrastructure/api/repositories";
import { uploadUserArtifact } from "@/infrastructure/api/repositories/artifact.repository";
import { QJudgeCopilotTranslations } from "../adapters/qJudgeCopilotTranslations";
import { useReactRouterCopilotSessionLocation } from "../adapters/reactRouterCopilotSessionLocation";
import { useChatbot } from "../hooks/useChatbot";
import { useAiSessionParam } from "../lib/aiSessionUrl";
import { ArtifactPanelProvider } from "./ArtifactPanelContext";

type ChatbotContextValue = ReturnType<typeof useChatbot>;

const ChatbotContext = createContext<ChatbotContextValue | null>(null);

export function ChatbotProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const enabled = !!user;
  const sessionLocation = useReactRouterCopilotSessionLocation();
  const transport = useMemo(
    () => createQJudgeCopilotTransport(chatbotRepository, uploadUserArtifact),
    [],
  );
  const storage = useMemo(() => new BrowserCopilotStorage(), []);
  const translations = useMemo(() => new QJudgeCopilotTranslations(), []);
  return (
    <CopilotProvider
      transport={transport}
      sessionLocation={sessionLocation}
      storage={storage}
      translations={translations}
      initialSession="first"
      enabled={enabled}
    >
      <LegacyChatbotProvider enabled={enabled}>{children}</LegacyChatbotProvider>
    </CopilotProvider>
  );
}

function LegacyChatbotProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const { aiSessionId, setAiSessionId } = useAiSessionParam();
  const chatbot = useChatbot({ enabled, initialSessionIdHint: aiSessionId });

  // 用 ref 持有最新 chatbot，effect 本身只依賴需要的 primitive，避免每 render
  // 都因為 chatbot 物件 reference 改變而把 effect 清掉重跑。
  const chatbotRef = useRef(chatbot);
  useEffect(() => {
    chatbotRef.current = chatbot;
  });

  // 紀錄上一輪 render 看到的 URL 與 state，用來判斷「這一輪 render 誰真的變動」。
  // 不這樣做的話，URL 剛變的那輪 render 裡 state 還是舊值，一個 effect 會把 URL
  // 扭成舊 state，另一個 effect 會把 state 拉去新 URL，下一輪又鏡像一次互扭，形成無限橫跳。
  const lastUrlRef = useRef<string | null>(aiSessionId);
  const lastStateRef = useRef<string | null>(chatbot.currentSessionId);

  useEffect(() => {
    if (chatbot.isInitializing) return;

    const urlChanged = aiSessionId !== lastUrlRef.current;
    const stateChanged = chatbot.currentSessionId !== lastStateRef.current;
    lastUrlRef.current = aiSessionId;
    lastStateRef.current = chatbot.currentSessionId;

    if (aiSessionId === chatbot.currentSessionId) return;

    // URL 剛變動且有值 → URL 是權威，同步 state。若 id 還不在 sessions list
    // （例如 AI Task 在他頁剛建立的 session）先 refreshSessions 再 switch。
    if (urlChanged && aiSessionId) {
      const current = chatbotRef.current;
      const inList = current.sessions.some((s) => s.id === aiSessionId);
      if (!inList) void current.refreshSessions();
      void current.switchSession(aiSessionId);
      return;
    }

    // 僅 state 變動（createSession / deleteSession / sendMessage 的 temp→real 升級）
    // → 把新值寫回 URL。跳過 temp 前綴（不是 real backend id）。
    if (stateChanged && chatbot.currentSessionId && !chatbot.currentSessionId.startsWith("temp-")) {
      setAiSessionId(chatbot.currentSessionId, { replace: true });
    }
  }, [aiSessionId, chatbot.currentSessionId, chatbot.isInitializing, setAiSessionId]);

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
