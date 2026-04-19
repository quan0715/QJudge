import { createContext, useContext, useState, useCallback, useMemo } from "react";

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

export function AppSidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(getInitialOpen);

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

  return (
    <AppSidebarContext.Provider value={value}>
      {children}
    </AppSidebarContext.Provider>
  );
}

export function useAppSidebar(): AppSidebarContextValue {
  return useContext(AppSidebarContext);
}
