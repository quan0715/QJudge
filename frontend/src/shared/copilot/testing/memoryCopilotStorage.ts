import type { CopilotStorage } from "@/core/copilot";

export class MemoryCopilotStorage implements CopilotStorage {
  private readonly values: Map<string, string>;

  constructor(entries: Iterable<readonly [string, string]> = []) {
    this.values = new Map(entries);
  }

  get(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.values.set(key, value);
  }

  remove(key: string): void {
    this.values.delete(key);
  }
}
