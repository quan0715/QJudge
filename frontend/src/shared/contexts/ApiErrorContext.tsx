import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useTransition,
} from "react";
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useToast } from "./ToastContext";

interface ApiErrorContextType {
  /**
   * Handle server error (5xx) - shows toast without hard redirect
   */
  handleServerError: (statusCode: number, message?: string) => void;
  /**
   * Handle not found error (404) - navigates to 404 page
   */
  handleNotFound: () => void;
  /**
   * Clear current error state
   */
  clearError: () => void;
  /**
   * Current error state
   */
  error: ApiError | null;
}

interface ApiError {
  type: "server" | "notfound";
  statusCode: number;
  message?: string;
  timestamp: string;
}

const isExamCriticalRoute = (pathname: string): boolean => {
  const classroomContestRoute = /^\/classrooms\/[^/]+\/contest\/[^/]+(?:\/|$)/;
  if (!classroomContestRoute.test(pathname)) return false;
  if (pathname.includes("/solve")) return true;
  if (pathname.includes("/exam-precheck")) return true;
  return false;
};

const ApiErrorContext = createContext<ApiErrorContextType | undefined>(
  undefined
);

interface ApiErrorProviderProps {
  children: ReactNode;
}

export const ApiErrorProvider = ({ children }: ApiErrorProviderProps) => {
  const location = useLocation();
  const { showToast } = useToast();
  const [error, setError] = useState<ApiError | null>(null);
  const [, startTransition] = useTransition();
  const lastServerToastAtRef = useRef(0);
  const SERVER_TOAST_THROTTLE_MS = 5000;

  const handleServerError = useCallback(
    (statusCode: number, message?: string) => {
      const errorData: ApiError = {
        type: "server",
        statusCode,
        message,
        timestamp: new Date().toLocaleString(),
      };
      setError(errorData);

      const now = Date.now();
      if (now - lastServerToastAtRef.current < SERVER_TOAST_THROTTLE_MS) {
        return; // Avoid toast storms when many requests fail simultaneously
      }
      lastServerToastAtRef.current = now;

      const isExamRoute = isExamCriticalRoute(location.pathname);
      showToast({
        kind: "error",
        title: isExamRoute ? "連線暫時異常，系統會自動重試" : `伺服器錯誤 (${statusCode})`,
        subtitle: message || (isExamRoute ? "請留在此頁面繼續作答，不需重新登入。" : "請稍後再試。"),
        timeout: isExamRoute ? 5000 : 4000,
      });
    },
    [location.pathname, showToast]
  );

  const handleNotFound = useCallback(() => {
    const errorData: ApiError = {
      type: "notfound",
      statusCode: 404,
      timestamp: new Date().toLocaleString(),
    };
    setError(errorData);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Clear stale error state when route changes
  useEffect(() => {
    if (error) {
      startTransition(() => {
        setError(null);
      });
    }
  }, [location.pathname, error, startTransition]);

  // Listen for global server error events from httpClient
  useEffect(() => {
    const handleGlobalServerError = (event: CustomEvent) => {
      const { statusCode, message } = event.detail;
      handleServerError(statusCode, message);
    };

    window.addEventListener(
      "server-error",
      handleGlobalServerError as EventListener
    );

    return () => {
      window.removeEventListener(
        "server-error",
        handleGlobalServerError as EventListener
      );
    };
  }, [handleServerError]);

  return (
    <ApiErrorContext.Provider
      value={{
        handleServerError,
        handleNotFound,
        error,
        clearError,
      }}
    >
      {children}
    </ApiErrorContext.Provider>
  );
};

export const useApiError = (): ApiErrorContextType => {
  const context = useContext(ApiErrorContext);
  if (context === undefined) {
    throw new Error("useApiError must be used within an ApiErrorProvider");
  }
  return context;
};

/**
 * Utility function to check if response is a server error
 */
export const isServerError = (status: number): boolean => {
  return status >= 500 && status < 600;
};

/**
 * Utility function to check if response is not found
 */
export const isNotFoundError = (status: number): boolean => {
  return status === 404;
};
