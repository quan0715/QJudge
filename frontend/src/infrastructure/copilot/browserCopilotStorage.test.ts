import { describe, expect, it } from "vitest";
import { BrowserCopilotStorage } from "./browserCopilotStorage";

describe("BrowserCopilotStorage", () => {
  it("delegates string preferences to storage", () => {
    const values = new Map<string, string>();
    const browserStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    } as unknown as Storage;
    const storage = new BrowserCopilotStorage(browserStorage);
    storage.set("copilot:model", "model-1");
    expect(storage.get("copilot:model")).toBe("model-1");
    storage.remove("copilot:model");
    expect(storage.get("copilot:model")).toBeNull();
  });

  it("swallows unavailable browser storage failures", () => {
    const unavailable = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      removeItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    } as unknown as Storage;
    const storage = new BrowserCopilotStorage(unavailable);

    expect(storage.get("key")).toBeNull();
    expect(() => storage.set("key", "value")).not.toThrow();
    expect(() => storage.remove("key")).not.toThrow();
  });
});
