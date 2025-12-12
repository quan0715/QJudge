import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import type { ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";

interface ApiErrorContextType {
  /**
   * Handle server error (5xx) - navigates to error page
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

const ApiErrorContext = createContext<ApiErrorContextType | undefined>(
  undefined
);

interface ApiErrorProviderProps {
  children: ReactNode;
}

export const ApiErrorProvider = ({ children }: ApiErrorProviderProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<ApiError | null>(null);

  const handleServerError = useCallback(
    (statusCode: number, message?: string) => {
      const errorData: ApiError = {
        type: "server",
        statusCode,
        message,
        timestamp: new Date().toLocaleString(),
      };
      setError(errorData);

      // Navigate to server error page with state
      navigate("/error", {
        state: {
          statusCode,
          message,
          timestamp: errorData.timestamp,
        },
        replace: true,
      });
    },
    [navigate]
  );

  const handleNotFound = useCallback(() => {
    const errorData: ApiError = {
      type: "notfound",
      statusCode: 404,
      timestamp: new Date().toLocaleString(),
    };
    setError(errorData);

    navigate("/not-found", { replace: true });
  }, [navigate]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Clear error when navigating away from error pages
  useEffect(() => {
    if (
      error &&
      location.pathname !== "/error" &&
      location.pathname !== "/not-found"
    ) {
      setError(null);
    }
  }, [location.pathname, error]);

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
