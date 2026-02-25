import { login } from "@/infrastructure/api/repositories/auth.repository";
import type { LoginCredentials } from "@/core/entities/auth.entity";

const processEnv =
  ((globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env ?? {});

const DEFAULT_BASE_URL =
  processEnv.API_BASE_URL ||
  processEnv.VITE_API_TARGET ||
  "http://localhost:8001";

const createLocalStorage = (): Storage => {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear: () => {
      store.clear();
    },
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  } as Storage;
};

const ensureDomGlobals = () => {
  const BaseEvent =
    globalThis.Event ||
    class {
      type: string;

      constructor(type: string) {
        this.type = type;
      }
    };

  if (!globalThis.Event) {
    globalThis.Event = BaseEvent as typeof Event;
  }

  if (!globalThis.CustomEvent) {
    class TestCustomEvent<T = unknown> extends (BaseEvent as typeof Event) {
      detail?: T;

      constructor(type: string, init?: { detail?: T }) {
        super(type);
        this.detail = init?.detail;
      }
    }

    globalThis.CustomEvent = TestCustomEvent as unknown as typeof CustomEvent;
  }

  if (!globalThis.window) {
    (globalThis as unknown as { window?: Window }).window = {
      location: { pathname: "/", href: "" },
      dispatchEvent: () => true,
    } as unknown as Window;
  }

  if (!globalThis.document) {
    (globalThis as unknown as { document?: Document }).document = {
      cookie: "",
      documentElement: {},
    } as unknown as Document;
  }
};

export const setupApiTestEnv = (baseUrl = DEFAULT_BASE_URL) => {
  const nativeFetch = globalThis.fetch;

  if (!nativeFetch) {
    throw new Error("Global fetch is not available in this environment");
  }

  ensureDomGlobals();

  Object.defineProperty(globalThis, "localStorage", {
    value: createLocalStorage(),
    configurable: true,
  });

  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    // Auto-attach Authorization header from localStorage token
    const token = globalThis.localStorage?.getItem("token");
    if (token) {
      const headers = new Headers(init?.headers || {});
      if (!headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      init = { ...init, headers };
    }

    if (typeof input === "string") {
      const url = input.startsWith("http")
        ? input
        : new URL(input, baseUrl).toString();
      return nativeFetch(url, init);
    }

    if (input instanceof URL) {
      const url = input.toString().startsWith("http")
        ? input.toString()
        : new URL(input.toString(), baseUrl).toString();
      return nativeFetch(url, init);
    }

    if (typeof Request !== "undefined" && input instanceof Request) {
      const requestUrl = input.url.startsWith("http")
        ? input.url
        : new URL(input.url, baseUrl).toString();
      return nativeFetch(new Request(requestUrl, input), init);
    }

    return nativeFetch(input, init);
  };

  return {
    baseUrl,
    restore: () => {
      globalThis.fetch = nativeFetch;
    },
  };
};

export const setAuthToken = (token?: string) => {
  if (!globalThis.localStorage) {
    throw new Error("localStorage is not initialized in test environment");
  }

  if (!token) {
    globalThis.localStorage.removeItem("token");
    return;
  }

  globalThis.localStorage.setItem("token", token);
};

export const loginAndSetToken = async (credentials: LoginCredentials) => {
  const response = await login(credentials);
  const token = response?.data?.access_token;

  if (!token) {
    throw new Error("Login response missing access token");
  }

  setAuthToken(token);
  return response.data.user;
};

export const getApiBaseUrl = () => DEFAULT_BASE_URL;
