/**
 * Clear auth storage (for logout or token expiry)
 * Note: JWT tokens are now stored in HttpOnly cookies (more secure),
 * but we keep localStorage for user info cache.
 */
export const clearAuthStorage = () => {
  localStorage.removeItem("user");
  window.dispatchEvent(new Event("storage"));
};

/**
 * Get CSRF token from cookie.
 * The csrftoken cookie is NOT HttpOnly, so we can read it from JavaScript.
 * This token must be included in the X-CSRFToken header for state-changing
 * requests (POST, PUT, PATCH, DELETE) when using cookie-based authentication.
 */
const getCsrfToken = (): string | null => {
  if (typeof document === "undefined") return null;

  const name = "csrftoken";
  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const [key, value] = cookie.trim().split("=");
    if (key === name) {
      return decodeURIComponent(value);
    }
  }
  return null;
};

const DEVICE_ID_KEY = "qjudge.device_id.v1";
const AUTH_REFRESH_ENDPOINT = "/api/v1/auth/refresh";

const ensureDeviceId = (): string => {
  if (typeof window === "undefined") return "server";
  const existing = window.localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  let nextId = "";
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    nextId = crypto.randomUUID();
  } else {
    nextId = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
  window.localStorage.setItem(DEVICE_ID_KEY, nextId);
  return nextId;
};

const redirectToLogin = () => {
  if (typeof window === "undefined") return;
  const path = window.location.pathname;
  // Skip redirect for pages that handle their own auth flow
  if (
    path.startsWith("/login") ||
    path.startsWith("/register") ||
    path.startsWith("/auth/") ||
    path.startsWith("/magic-links")
  ) {
    return;
  }
  window.location.href = "/login";
};

const isAuthFlowPath = (): boolean => {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname;
  return (
    path.startsWith("/login") ||
    path.startsWith("/register") ||
    path.startsWith("/auth/") ||
    path.startsWith("/magic-links")
  );
};

const shouldAttemptTokenRefresh = (endpoint: string): boolean => {
  if (isAuthFlowPath()) return false;
  if (endpoint === AUTH_REFRESH_ENDPOINT) return false;
  if (endpoint.startsWith("/api/v1/auth/login/")) return false;
  if (endpoint.startsWith("/api/v1/auth/register/")) return false;
  if (endpoint.startsWith("/api/v1/auth/callback/")) return false;
  if (endpoint === "/api/v1/auth/logout") return false;
  return true;
};

const handleUnauthorized = (): void => {
  if (!isAuthFlowPath()) {
    clearAuthStorage();
  }
  redirectToLogin();
};

/**
 * Dispatch server error event for global error handling.
 * This event is listened to by ApiErrorContext to show non-blocking toasts.
 */
const dispatchServerError = (statusCode: number, message?: string) => {
  window.dispatchEvent(
    new CustomEvent("server-error", {
      detail: { statusCode, message },
    })
  );
};

const shouldDispatchServerError = (endpoint: string): boolean => {
  // Anti-cheat telemetry endpoints are noisy and transient failures (e.g. 502)
  // should not hard-redirect users away from exam screens.
  if (endpoint.includes("/exam/events/")) return false;
  if (endpoint.includes("/exam/anticheat-urls/")) return false;
  return true;
};

/**
 * Handle server errors (5xx) - dispatch event for global handling
 */
const handleServerError = (endpoint: string, response: Response): boolean => {
  if (response.status >= 500 && response.status < 600) {
    if (shouldDispatchServerError(endpoint)) {
      dispatchServerError(response.status, `伺服器錯誤 (${response.status})`);
    }
    return true;
  }
  return false;
};

const readJson = async (response: Response): Promise<any> => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const getErrorMessage = (data: any, fallback: string): string => {
  if (!data) return fallback;
  // Standardized backend format: {success: false, error: {code, message, ...}}
  if (data.error?.message && typeof data.error.message === "string") {
    return data.error.message;
  }
  return fallback;
};

const buildHeaders = (init: RequestInit = {}): Headers => {
  const headers = new Headers(init.headers || {});
  const method = init.method?.toUpperCase() || "GET";

  if (!["GET", "HEAD", "OPTIONS", "TRACE"].includes(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken && !headers.has("X-CSRFToken")) {
      headers.set("X-CSRFToken", csrfToken);
    }
  }

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  if (!headers.has("X-Device-Id")) {
    headers.set("X-Device-Id", ensureDeviceId());
  }

  return headers;
};

const performFetch = (endpoint: string, init: RequestInit = {}) =>
  fetch(endpoint, {
    ...init,
    headers: buildHeaders(init),
    credentials: "include",
  });

let refreshPromise: Promise<boolean> | null = null;

const refreshAuthSession = async (): Promise<boolean> => {
  if (!refreshPromise) {
    refreshPromise = performFetch(AUTH_REFRESH_ENDPOINT, {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
};

export const requestJson = async <T>(
  request: Promise<Response>,
  fallbackError = "Request failed"
): Promise<T> => {
  const response = await request;
  if (!response.ok) {
    const errorData = await readJson(response);
    const error = new Error(getErrorMessage(errorData, fallbackError)) as Error & {
      status?: number;
      response?: {
        status: number;
        data: any;
      };
    };
    error.status = response.status;
    error.response = {
      status: response.status,
      data: errorData,
    };
    throw error;
  }
  return (await readJson(response)) as T;
};

export const ensureOk = async (
  request: Promise<Response>,
  fallbackError = "Request failed"
): Promise<void> => {
  const response = await request;
  if (!response.ok) {
    const errorData = await readJson(response);
    const error = new Error(getErrorMessage(errorData, fallbackError)) as Error & {
      status?: number;
      response?: {
        status: number;
        data: any;
      };
    };
    error.status = response.status;
    error.response = {
      status: response.status,
      data: errorData,
    };
    throw error;
  }
};

/**
 * Base fetch wrapper with HttpOnly cookie support and CSRF protection.
 *
 * Security:
 * - JWT tokens are stored in HttpOnly cookies by the backend (XSS protection)
 * - CSRF token is included in X-CSRFToken header for state-changing requests
 * - The `credentials: 'include'` option ensures cookies are sent with requests
 */
const customFetch = async (endpoint: string, init: RequestInit = {}) => {
  let response = await performFetch(endpoint, init);

  if (response.status === 401 && shouldAttemptTokenRefresh(endpoint)) {
    const refreshed = await refreshAuthSession();
    if (refreshed) {
      response = await performFetch(endpoint, init);
    }
  }

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Unauthorized");
  }

  // Handle server errors (5xx) - dispatch event but don't throw
  // This allows components to still handle the error if needed
  if (handleServerError(endpoint, response)) {
    // Don't throw - let calling code decide how to handle
  }

  return response;
};

export const httpClient = {
  request: customFetch,
  get: (url: string, init?: RequestInit) =>
    customFetch(url, { ...init, method: "GET" }),
  post: (url: string, body?: any, init?: RequestInit) =>
    customFetch(url, {
      ...init,
      method: "POST",
      body: JSON.stringify(body),
      headers: { ...init?.headers, "Content-Type": "application/json" },
    }),
  put: (url: string, body?: any, init?: RequestInit) =>
    customFetch(url, {
      ...init,
      method: "PUT",
      body: JSON.stringify(body),
      headers: { ...init?.headers, "Content-Type": "application/json" },
    }),
  patch: (url: string, body?: any, init?: RequestInit) =>
    customFetch(url, {
      ...init,
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { ...init?.headers, "Content-Type": "application/json" },
    }),
  delete: (url: string, init?: RequestInit) =>
    customFetch(url, { ...init, method: "DELETE" }),
};
