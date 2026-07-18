import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import type { CopilotSessionLocation } from "@/core/copilot";

type SearchParamsUpdate =
  | URLSearchParams
  | ((previous: URLSearchParams) => URLSearchParams);
type SetSearchParams = (
  update: SearchParamsUpdate,
  options?: { replace?: boolean },
) => void;

const DEFAULT_SESSION_PARAM = "ai_session_id";

export class ReactRouterCopilotSessionLocation
  implements CopilotSessionLocation
{
  private readonly listeners = new Set<(id: string | null) => void>();
  private currentId: string | null;
  private setSearchParams: SetSearchParams;
  private readonly paramName: string;

  constructor(
    searchParams: URLSearchParams,
    setSearchParams: SetSearchParams,
    paramName: string = DEFAULT_SESSION_PARAM,
  ) {
    this.setSearchParams = setSearchParams;
    this.paramName = paramName;
    this.currentId = searchParams.get(paramName);
  }

  get(): string | null {
    return this.currentId;
  }

  set(id: string | null, options: { replace?: boolean } = {}): void {
    this.setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (id) next.set(this.paramName, id);
        else next.delete(this.paramName);
        return next;
      },
      { replace: options.replace ?? true },
    );
    this.updateId(id);
  }

  subscribe(listener: (id: string | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  update(searchParams: URLSearchParams, setSearchParams: SetSearchParams): void {
    this.setSearchParams = setSearchParams;
    this.updateId(searchParams.get(this.paramName));
  }

  private updateId(id: string | null): void {
    if (id === this.currentId) return;
    this.currentId = id;
    for (const listener of [...this.listeners]) listener(id);
  }
}

export function useReactRouterCopilotSessionLocation(
  paramName: string = DEFAULT_SESSION_PARAM,
): CopilotSessionLocation {
  const [searchParams, setSearchParams] = useSearchParams();
  const locationRef = useRef<ReactRouterCopilotSessionLocation | null>(null);
  if (!locationRef.current) {
    locationRef.current = new ReactRouterCopilotSessionLocation(
      searchParams,
      setSearchParams,
      paramName,
    );
  }
  const location = locationRef.current;
  useEffect(() => {
    location.update(searchParams, setSearchParams);
  }, [location, searchParams, setSearchParams]);
  return location;
}
