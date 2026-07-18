import type { CopilotSessionLocation } from "@/core/copilot";

export class MemoryCopilotSessionLocation implements CopilotSessionLocation {
  private readonly listeners = new Set<(id: string | null) => void>();
  private id: string | null;

  constructor(id: string | null = null) {
    this.id = id;
  }

  get(): string | null {
    return this.id;
  }

  set(id: string | null): void {
    if (this.id === id) return;
    this.id = id;
    for (const listener of [...this.listeners]) listener(id);
  }

  subscribe(listener: (id: string | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
