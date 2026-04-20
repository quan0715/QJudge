import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/features/auth/contexts/AuthContext";

const LEFT_STORAGE_KEY = "workspace_left_open";
const RIGHT_STORAGE_KEY = "workspace_right_open";
const MOBILE_BREAKPOINT_PX = 768;

export interface PanelControl {
  /** 面板當前是否實際展開（已考量 isAllowed / isDisabled）。 */
  isOpen: boolean;
  /** 使用者偏好的開啟狀態（不考慮 disable / allowed），用於 UI 還原。 */
  isOpenPreference: boolean;
  /** 是否被某段商業邏輯臨時禁用（例如競賽中、/chat 主畫面）。 */
  isDisabled: boolean;
  /** 對當前使用者是否可用（例如 right panel 對 student 不可用）。 */
  isAllowed: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  /** 註冊一個 disable 來源；同一 id 多次呼叫等同一次。 */
  disable: (id: string) => void;
  /** 移除 disable 來源；最後一個解除後才真正啟用。 */
  enable: (id: string) => void;
}

export interface WorkspaceContextValue {
  isMobile: boolean;
  left: PanelControl;
  right: PanelControl;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function readStored(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return v === "true";
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: boolean) {
  try { localStorage.setItem(key, String(value)); } catch { /* ignore */ }
}

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT_PX,
  );
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`);
    const apply = () => setMobile(mql.matches);
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, []);
  return mobile;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const rightAllowed = user?.role === "teacher" || user?.role === "admin";

  const [leftPref, setLeftPref] = useState(() => readStored(LEFT_STORAGE_KEY, true));
  const [rightPref, setRightPref] = useState(() => readStored(RIGHT_STORAGE_KEY, false));
  const [leftDisablers, setLeftDisablers] = useState<ReadonlySet<string>>(() => new Set());
  const [rightDisablers, setRightDisablers] = useState<ReadonlySet<string>>(() => new Set());
  const isMobile = useIsMobile();

  const persistLeft = useCallback((v: boolean) => {
    setLeftPref(v);
    writeStored(LEFT_STORAGE_KEY, v);
  }, []);
  const persistRight = useCallback((v: boolean) => {
    setRightPref(v);
    writeStored(RIGHT_STORAGE_KEY, v);
  }, []);

  const addLeftDisabler = useCallback((id: string) => {
    setLeftDisablers(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);
  const removeLeftDisabler = useCallback((id: string) => {
    setLeftDisablers(prev => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);
  const addRightDisabler = useCallback((id: string) => {
    setRightDisablers(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);
  const removeRightDisabler = useCallback((id: string) => {
    setRightDisablers(prev => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const leftDisabled = leftDisablers.size > 0;
  const rightDisabled = rightDisablers.size > 0;

  const left: PanelControl = useMemo(() => ({
    isOpen: leftPref && !leftDisabled,
    isOpenPreference: leftPref,
    isDisabled: leftDisabled,
    isAllowed: true,
    open: () => persistLeft(true),
    close: () => persistLeft(false),
    toggle: () => persistLeft(!leftPref),
    disable: addLeftDisabler,
    enable: removeLeftDisabler,
  }), [leftPref, leftDisabled, persistLeft, addLeftDisabler, removeLeftDisabler]);

  const right: PanelControl = useMemo(() => ({
    isOpen: rightPref && !rightDisabled && rightAllowed,
    isOpenPreference: rightPref,
    isDisabled: rightDisabled || !rightAllowed,
    isAllowed: rightAllowed,
    open: () => { if (rightAllowed) persistRight(true); },
    close: () => persistRight(false),
    toggle: () => { if (rightAllowed) persistRight(!rightPref); },
    disable: addRightDisabler,
    enable: removeRightDisabler,
  }), [rightPref, rightDisabled, rightAllowed, persistRight, addRightDisabler, removeRightDisabler]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({ isMobile, left, right }),
    [isMobile, left, right],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

const NULL_PANEL: PanelControl = {
  isOpen: false,
  isOpenPreference: false,
  isDisabled: false,
  isAllowed: false,
  open: () => {},
  close: () => {},
  toggle: () => {},
  disable: () => {},
  enable: () => {},
};

const NULL_VALUE: WorkspaceContextValue = {
  isMobile: false,
  left: NULL_PANEL,
  right: NULL_PANEL,
};

export function useWorkspace(): WorkspaceContextValue {
  return useContext(WorkspaceContext) ?? NULL_VALUE;
}
