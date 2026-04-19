import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { createPortal } from "react-dom";
import { Theme } from "@carbon/react";
import { SideMenu } from "@/features/app/components/SideMenu";
import { useTheme } from "@/shared/ui/theme/ThemeContext";
import styles from "./AppSidebarMobileOverlay.module.scss";

export interface AppSidebarContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const AppSidebarContext = createContext<AppSidebarContextValue>({
  isOpen: true,
  open: () => {},
  close: () => {},
  toggle: () => {},
});

const STORAGE_KEY = "app_sidebar_open";

function getInitialOpen(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) !== "false"; }
  catch { return true; }
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= 768,
  );
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 768px)");
    const handle = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handle);
    setIsMobile(mql.matches);
    return () => mql.removeEventListener("change", handle);
  }, []);
  return isMobile;
}

export function AppSidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(getInitialOpen);
  const isMobile = useIsMobile();
  const { theme } = useTheme();

  const persist = useCallback((value: boolean) => {
    setIsOpen(value);
    try { localStorage.setItem(STORAGE_KEY, String(value)); } catch { /* ignore */ }
  }, []);

  const open = useCallback(() => persist(true), [persist]);
  const close = useCallback(() => persist(false), [persist]);
  const toggle = useCallback(() => {
    setIsOpen(prev => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const value = useMemo<AppSidebarContextValue>(
    () => ({ isOpen, open, close, toggle }),
    [isOpen, open, close, toggle],
  );

  const showMobileOverlay = isOpen && isMobile;

  return (
    <AppSidebarContext.Provider value={value}>
      {children}

      {/* Mobile drawer overlay — rendered when isOpen on small screens */}
      {showMobileOverlay && typeof document !== "undefined" && createPortal(
        <Theme theme={theme}>
          <div className={styles.overlay}>
            <div className={styles.panel}>
              <SideMenu variant="panel" />
            </div>
            <div className={styles.backdrop} onClick={close} aria-hidden="true" />
          </div>
        </Theme>,
        document.body,
      )}
    </AppSidebarContext.Provider>
  );
}

export function useAppSidebar(): AppSidebarContextValue {
  return useContext(AppSidebarContext);
}
