import type { CopilotStorage } from "@/core/copilot";

export class BrowserCopilotStorage implements CopilotStorage {
  private readonly storage: Storage | null;

  constructor(storage?: Storage) {
    if (storage) {
      this.storage = storage;
      return;
    }
    try {
      this.storage = window.localStorage;
    } catch {
      this.storage = null;
    }
  }

  get(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  set(key: string, value: string): void {
    try {
      this.storage?.setItem(key, value);
    } catch {
      // Browser privacy settings and quota errors must not break chat runtime.
    }
  }

  remove(key: string): void {
    try {
      this.storage?.removeItem(key);
    } catch {
      // Preference persistence is best effort.
    }
  }
}
