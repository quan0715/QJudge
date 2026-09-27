import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { CopilotSessionLocation } from "@copilot";

type SetSearchParams = (
  next: URLSearchParams,
  options?: { replace?: boolean },
) => void;

const SESSION_PARAM = "ai_session_id";

export class ReactRouterCopilotSessionLocation
  implements CopilotSessionLocation
{
  private readonly listeners = new Set<(id: string | null) => void>();
  private currentId: string | null;
  private searchParams: URLSearchParams;
  private setSearchParams: SetSearchParams;
  private readonly paramName: string;

  constructor(
    searchParams: URLSearchParams,
    setSearchParams: SetSearchParams,
    paramName: string = SESSION_PARAM,
  ) {
    this.paramName = paramName;
    this.searchParams = searchParams;
    this.setSearchParams = setSearchParams;
    this.currentId = searchParams.get(paramName);
  }

  get(): string | null {
    return this.currentId;
  }

  set(id: string | null, options: { replace?: boolean } = {}): void {
    if (this.searchParams.get(this.paramName) !== id) {
      const next = new URLSearchParams(this.searchParams);
      if (id) next.set(this.paramName, id);
      else next.delete(this.paramName);
      this.searchParams = next;
      this.setSearchParams(next, { replace: options.replace ?? true });
    }
    this.updateId(id);
  }

  subscribe(listener: (id: string | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Points writes at the latest router state; safe to call during render. */
  bind(searchParams: URLSearchParams, setSearchParams: SetSearchParams): void {
    this.searchParams = searchParams;
    this.setSearchParams = setSearchParams;
  }

  /** Notifies listeners when the URL changed outside of `set`. */
  syncFromUrl(): void {
    this.updateId(this.searchParams.get(this.paramName));
  }

  private updateId(id: string | null): void {
    if (id === this.currentId) return;
    this.currentId = id;
    for (const listener of [...this.listeners]) listener(id);
  }
}

export function useReactRouterCopilotSessionLocation(): CopilotSessionLocation {
  const [searchParams, setSearchParams] = useSearchParams();
  const [location] = useState(
    () => new ReactRouterCopilotSessionLocation(searchParams, setSearchParams),
  );
  // Bind during render: CopilotProvider writes from layout effects, which run
  // before this hook's passive effect. A setter bound later would resolve
  // against a stale URL and navigate back to it (e.g. the previous panel).
  location.bind(searchParams, setSearchParams);
  useEffect(() => {
    location.syncFromUrl();
  }, [location, searchParams]);
  return location;
}
