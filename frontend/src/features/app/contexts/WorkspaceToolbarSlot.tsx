import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Slot context：讓 `WorkspaceShell` 知道目前 main content 裡有沒有頁面自己的
 * `WorkspaceToolBar`，以決定是否補一條 fallback chrome（只有展開按鈕）。
 *
 * 設計原則：WorkspaceShell 只在 **頁面沒有自行 render WorkspaceToolBar**，
 * 且 left panel 關閉/需要展開入口時，補一個最小 chrome。避免雙重 toolbar。
 */
interface SlotValue {
  count: number;
  register: () => void;
  unregister: () => void;
}

const WorkspaceToolbarSlotContext = createContext<SlotValue | null>(null);

export function WorkspaceToolbarSlotProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const register = useCallback(() => setCount(c => c + 1), []);
  const unregister = useCallback(() => setCount(c => c - 1), []);
  const value = useMemo<SlotValue>(
    () => ({ count, register, unregister }),
    [count, register, unregister],
  );
  return (
    <WorkspaceToolbarSlotContext.Provider value={value}>
      {children}
    </WorkspaceToolbarSlotContext.Provider>
  );
}

/** Shell 用：讀取頁面是否已 mount 自己的 WorkspaceToolBar。 */
export function usePageToolbarMounted(): boolean {
  const ctx = useContext(WorkspaceToolbarSlotContext);
  return (ctx?.count ?? 0) > 0;
}

/**
 * WorkspaceToolBar 用：mount 時通知 Shell「本頁自有 toolbar」。
 * 若未處於 Provider 範圍內（例如 chat 右側面板），不註冊，保持 pageToolbar=0。
 */
export function useRegisterPageToolbar() {
  const ctx = useContext(WorkspaceToolbarSlotContext);
  const register = ctx?.register;
  const unregister = ctx?.unregister;
  useLayoutEffect(() => {
    if (!register || !unregister) return;
    register();
    return () => unregister();
  }, [register, unregister]);
}
