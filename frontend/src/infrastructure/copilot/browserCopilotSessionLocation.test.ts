import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserCopilotSessionLocation } from "./browserCopilotSessionLocation";

describe("BrowserCopilotSessionLocation", () => {
  afterEach(() => {
    history.replaceState({}, "", "/");
    vi.restoreAllMocks();
  });

  it("sets and removes session while preserving unrelated query and hash", () => {
    history.replaceState({}, "", "/chat?tab=history#latest");
    const replaceState = vi.spyOn(history, "replaceState");
    const location = new BrowserCopilotSessionLocation();

    location.set("session-1");
    expect(window.location.href).toContain(
      "/chat?tab=history&ai_session_id=session-1#latest",
    );
    expect(replaceState).toHaveBeenCalled();

    location.set(null);
    expect(window.location.href).toContain("/chat?tab=history#latest");
  });

  it("notifies subscribers for local writes and browser popstate", () => {
    const location = new BrowserCopilotSessionLocation();
    const listener = vi.fn();
    const unsubscribe = location.subscribe(listener);

    location.set("session-1");
    history.pushState({}, "", "/?ai_session_id=session-2");
    window.dispatchEvent(new PopStateEvent("popstate"));
    unsubscribe();

    expect(listener).toHaveBeenNthCalledWith(1, "session-1");
    expect(listener).toHaveBeenNthCalledWith(2, "session-2");
  });
});
