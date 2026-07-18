import { act, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import {
  ReactRouterCopilotSessionLocation,
  useReactRouterCopilotSessionLocation,
} from "./reactRouterCopilotSessionLocation";

describe("ReactRouterCopilotSessionLocation", () => {
  it("preserves unrelated params and defaults to replace navigation", () => {
    let current = new URLSearchParams("tab=history");
    const setSearchParams = vi.fn((update) => {
      current = typeof update === "function" ? update(current) : update;
    });
    const location = new ReactRouterCopilotSessionLocation(
      current,
      setSearchParams,
    );

    location.set("session-1");
    expect(current.toString()).toBe("tab=history&ai_session_id=session-1");
    expect(setSearchParams).toHaveBeenLastCalledWith(
      expect.any(Function),
      { replace: true },
    );
    location.set(null, { replace: false });
    expect(current.toString()).toBe("tab=history");
    expect(setSearchParams).toHaveBeenLastCalledWith(
      expect.any(Function),
      { replace: false },
    );
  });

  it("keeps the legacy hook reactive to router search params", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={["/?ai_session_id=session-1"]}>
        {children}
      </MemoryRouter>
    );
    const { result } = renderHook(
      () => useReactRouterCopilotSessionLocation(),
      { wrapper },
    );

    expect(result.current.get()).toBe("session-1");
    act(() => result.current.set("session-2"));
    expect(result.current.get()).toBe("session-2");
  });
});
