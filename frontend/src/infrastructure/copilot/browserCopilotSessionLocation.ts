import type { CopilotSessionLocation } from "@copilot";

const DEFAULT_SESSION_PARAM = "ai_session_id";

export class BrowserCopilotSessionLocation implements CopilotSessionLocation {
  private readonly listeners = new Set<(id: string | null) => void>();
  private readonly handlePopState = () => this.notify();
  private readonly paramName: string;
  private readonly browserWindow: Window;

  constructor(
    paramName: string = DEFAULT_SESSION_PARAM,
    browserWindow: Window = window,
  ) {
    this.paramName = paramName;
    this.browserWindow = browserWindow;
  }

  get(): string | null {
    return new URLSearchParams(this.browserWindow.location.search).get(
      this.paramName,
    );
  }

  set(id: string | null, options: { replace?: boolean } = {}): void {
    const url = new URL(this.browserWindow.location.href);
    if (id) url.searchParams.set(this.paramName, id);
    else url.searchParams.delete(this.paramName);
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    const method = options.replace ?? true ? "replaceState" : "pushState";
    this.browserWindow.history[method](
      this.browserWindow.history.state,
      "",
      nextUrl,
    );
    this.notify();
  }

  subscribe(listener: (id: string | null) => void): () => void {
    if (this.listeners.size === 0) {
      this.browserWindow.addEventListener("popstate", this.handlePopState);
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.browserWindow.removeEventListener("popstate", this.handlePopState);
      }
    };
  }

  private notify(): void {
    const id = this.get();
    for (const listener of [...this.listeners]) listener(id);
  }
}
