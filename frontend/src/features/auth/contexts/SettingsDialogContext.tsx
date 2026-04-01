import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface SettingsDialogContextType {
  isOpen: boolean;
  initialTab: number;
  open: (tab?: number) => void;
  close: () => void;
}

const SettingsDialogContext = createContext<SettingsDialogContextType | undefined>(undefined);

export const SettingsDialogProvider = ({ children }: { children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [initialTab, setInitialTab] = useState(0);

  const open = useCallback((tab = 0) => {
    setInitialTab(tab);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <SettingsDialogContext.Provider value={{ isOpen, initialTab, open, close }}>
      {children}
    </SettingsDialogContext.Provider>
  );
};

export const useSettingsDialog = () => {
  const ctx = useContext(SettingsDialogContext);
  if (!ctx) throw new Error("useSettingsDialog must be used within SettingsDialogProvider");
  return ctx;
};
