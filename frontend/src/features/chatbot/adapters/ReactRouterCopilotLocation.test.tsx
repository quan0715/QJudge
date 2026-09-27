import { act, render, renderHook } from "@testing-library/react";
import {
  MemoryRouter,
  useLocation,
  useNavigate,
  type NavigateFunction,
} from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { useLayoutEffect, type ReactNode } from "react";
import {
  ReactRouterCopilotSessionLocation,
  useReactRouterCopilotSessionLocation,
} from "./reactRouterCopilotSessionLocation";

describe("ReactRouterCopilotSessionLocation", () => {
  it("preserves unrelated params and defaults to replace navigation", () => {
    const setSearchParams = vi.fn();
    const location = new ReactRouterCopilotSessionLocation(
      new URLSearchParams("tab=history"),
      setSearchParams,
    );

    location.set("session-1");
    expect(setSearchParams).toHaveBeenLastCalledWith(
      new URLSearchParams("tab=history&ai_session_id=session-1"),
      { replace: true },
    );
    location.set(null, { replace: false });
    expect(setSearchParams).toHaveBeenLastCalledWith(
      new URLSearchParams("tab=history"),
      { replace: false },
    );
  });

  it("does not navigate when the session param is already in place", () => {
    const setSearchParams = vi.fn();
    const location = new ReactRouterCopilotSessionLocation(
      new URLSearchParams("panel=overview"),
      setSearchParams,
    );

    location.set(null);
    expect(setSearchParams).not.toHaveBeenCalled();
  });

  it("keeps the hook reactive to router search params", () => {
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

  it("writes against the latest search params from a child layout effect", () => {
    const router: { navigate: NavigateFunction | null; search: string } = {
      navigate: null,
      search: "",
    };

    function ClearOnPanelChange({
      location,
    }: {
      location: ReturnType<typeof useReactRouterCopilotSessionLocation>;
    }) {
      const routerLocation = useLocation();
      const panel = new URLSearchParams(routerLocation.search).get("panel");
      // Mirrors CopilotProvider clearing the session in a layout effect when
      // it becomes disabled, which runs before the parent's passive effects.
      useLayoutEffect(() => {
        if (panel !== "ai-grading") location.set(null);
      }, [location, panel]);
      return null;
    }

    function Harness() {
      const location = useReactRouterCopilotSessionLocation();
      router.navigate = useNavigate();
      router.search = useLocation().search;
      return <ClearOnPanelChange location={location} />;
    }

    render(
      <MemoryRouter
        initialEntries={["/admin?panel=ai-grading&ai_session_id=session-1"]}
      >
        <Harness />
      </MemoryRouter>,
    );

    act(() => router.navigate?.("/admin?panel=overview&ai_session_id=session-1"));

    expect(router.search).toBe("?panel=overview");
  });
});
