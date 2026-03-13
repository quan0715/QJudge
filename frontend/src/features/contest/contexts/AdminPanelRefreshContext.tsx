import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type { AdminPanelId } from "@/features/contest/modules/types";

type PanelRefreshHandler = () => Promise<void> | void;

interface AdminPanelRefreshContextType {
  registerPanelRefresh: (
    panelId: AdminPanelId,
    handler: PanelRefreshHandler,
  ) => () => void;
  triggerPanelRefresh: (panelId: AdminPanelId) => Promise<boolean>;
}

const AdminPanelRefreshContext = createContext<
  AdminPanelRefreshContextType | undefined
>(undefined);

interface AdminPanelRefreshProviderProps {
  children: ReactNode;
}

export const AdminPanelRefreshProvider = ({
  children,
}: AdminPanelRefreshProviderProps) => {
  const handlersRef = useRef(new Map<AdminPanelId, PanelRefreshHandler>());

  const registerPanelRefresh = useCallback(
    (panelId: AdminPanelId, handler: PanelRefreshHandler) => {
      handlersRef.current.set(panelId, handler);

      return () => {
        const current = handlersRef.current.get(panelId);
        if (current === handler) {
          handlersRef.current.delete(panelId);
        }
      };
    },
    [],
  );

  const triggerPanelRefresh = useCallback(async (panelId: AdminPanelId) => {
    const handler = handlersRef.current.get(panelId);
    if (!handler) return false;
    await Promise.resolve(handler());
    return true;
  }, []);

  const value = useMemo(
    () => ({
      registerPanelRefresh,
      triggerPanelRefresh,
    }),
    [registerPanelRefresh, triggerPanelRefresh],
  );

  return (
    <AdminPanelRefreshContext.Provider value={value}>
      {children}
    </AdminPanelRefreshContext.Provider>
  );
};

export const useAdminPanelRefresh = (): AdminPanelRefreshContextType => {
  const context = useContext(AdminPanelRefreshContext);
  if (!context) {
    throw new Error(
      "useAdminPanelRefresh must be used within AdminPanelRefreshProvider",
    );
  }
  return context;
};
