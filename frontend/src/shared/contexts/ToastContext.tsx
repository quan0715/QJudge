import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { ActionableNotification, ToastNotification } from "@carbon/react";

type ToastKind =
  | "error"
  | "info"
  | "info-square"
  | "success"
  | "warning"
  | "warning-alt";

interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  subtitle?: string;
  timeout?: number;
  /** A follow-up action; clicking it also closes the toast. */
  action?: { label: string; onClick: () => void };
}

interface ToastContextType {
  showToast: (toast: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    // ActionableNotification has no timeout of its own.
    if (toast.action) window.setTimeout(() => removeToast(id), toast.timeout ?? 3000);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        style={{
          position: "fixed",
          top: "4rem",
          right: "1rem",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        {toasts.map((toast) => toast.action ? (
          <ActionableNotification
            key={toast.id}
            kind={toast.kind}
            title={toast.title}
            subtitle={toast.subtitle}
            actionButtonLabel={toast.action.label}
            onActionButtonClick={() => {
              toast.action?.onClick();
              removeToast(toast.id);
            }}
            onClose={() => removeToast(toast.id)}
            hasFocus={false}
            style={{
              minWidth: "20rem",
              maxWidth: "25rem",
            }}
          />
        ) : (
          <ToastNotification
            key={toast.id}
            kind={toast.kind}
            title={toast.title}
            subtitle={toast.subtitle}
            timeout={toast.timeout ?? 3000}
            onClose={() => removeToast(toast.id)}
            style={{
              minWidth: "20rem",
              maxWidth: "25rem",
            }}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
};
