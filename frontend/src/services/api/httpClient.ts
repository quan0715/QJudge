/**
 * Clear auth storage (for logout or token expiry)
 * Note: JWT tokens are now stored in HttpOnly cookies (more secure),
 * but we keep localStorage for user info cache.
 */
export const clearAuthStorage = () => {
  localStorage.removeItem("token"); // Legacy support
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

const redirectToLogin = () => {
  if (
    typeof window !== "undefined" &&
    !window.location.pathname.startsWith("/login")
  ) {
    window.location.href = "/login";
  }
};

const handleUnauthorized = (response: Response): boolean => {
  if (response.status === 401) {
    clearAuthStorage();
    redirectToLogin();
    return true;
  }
  return false;
};

/**
 * Base fetch wrapper with HttpOnly cookie support and CSRF protection.
 *
 * Security:
 * - JWT tokens are stored in HttpOnly cookies by the backend (XSS protection)
 * - CSRF token is included in X-CSRFToken header for state-changing requests
 * - The `credentials: 'include'` option ensures cookies are sent with requests
 *
 * Fallback: For API clients that don't support cookies, the Authorization
 * header can still be used (reads from localStorage). In this case, no CSRF
 * token is needed since the token is not sent automatically.
 */
const customFetch = async (endpoint: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers || {});
  const method = init.method?.toUpperCase() || "GET";

  // For API clients without cookie support, fall back to localStorage token
  const token = localStorage.getItem("token");
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // Add CSRF token for state-changing requests (POST, PUT, PATCH, DELETE)
  // This is required when using cookie-based authentication
  if (!["GET", "HEAD", "OPTIONS", "TRACE"].includes(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken && !headers.has("X-CSRFToken")) {
      headers.set("X-CSRFToken", csrfToken);
    }
  }

  // Ensure we accept JSON
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  // Include credentials (cookies) in requests for HttpOnly cookie auth
  const response = await fetch(endpoint, {
    ...init,
    headers,
    credentials: "include", // Important: Send and receive cookies
  });

  if (handleUnauthorized(response)) {
    throw new Error("Unauthorized");
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
