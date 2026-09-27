import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type RequestCopilot = () => () => void;

interface CopilotDemandContextValue {
  isRequested: boolean;
  requestCopilot: RequestCopilot;
}

const noopRequest: RequestCopilot = () => () => undefined;

const CopilotDemandContext = createContext<CopilotDemandContextValue>({
  isRequested: false,
  requestCopilot: noopRequest,
});

/** Tracks screens that need the Copilot runtime even when the chat panel is closed. */
export function CopilotDemandProvider({ children }: { children: ReactNode }) {
  const [requestCount, setRequestCount] = useState(0);
  const requestCopilot = useCallback<RequestCopilot>(() => {
    setRequestCount((count) => count + 1);
    return () => setRequestCount((count) => count - 1);
  }, []);
  const value = useMemo(
    () => ({ isRequested: requestCount > 0, requestCopilot }),
    [requestCopilot, requestCount],
  );
  return (
    <CopilotDemandContext.Provider value={value}>
      {children}
    </CopilotDemandContext.Provider>
  );
}

export function useIsCopilotRequested(): boolean {
  return useContext(CopilotDemandContext).isRequested;
}

/**
 * 宣告此畫面需要 Copilot runtime：mount 時啟用，unmount 時釋放。
 * 讓 chatbot feature 不必認得其他 feature 的路由。
 */
export function useRequestCopilot(): void {
  const { requestCopilot } = useContext(CopilotDemandContext);
  useEffect(() => requestCopilot(), [requestCopilot]);
}
