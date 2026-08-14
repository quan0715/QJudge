export interface CopilotSessionLocation {
  get(): string | null;
  set(id: string | null, options?: { replace?: boolean }): void;
  subscribe(listener: (id: string | null) => void): () => void;
}
