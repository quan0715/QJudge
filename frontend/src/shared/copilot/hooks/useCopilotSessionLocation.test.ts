import { act, render, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { MemoryCopilotSessionLocation, MemoryCopilotTransport } from "../testing";
import { CopilotProvider } from "../react/CopilotProvider";
import { useCopilotSessionLocation } from "./useCopilotSessionLocation";

describe("useCopilotSessionLocation", () => {
  it("reads and writes the configured location port", async () => {
    const location = new MemoryCopilotSessionLocation("one");
    const { result } = renderHook(() => useCopilotSessionLocation(), {
      wrapper: ({ children }) =>
        createElement(
          CopilotProvider,
          { transport: new MemoryCopilotTransport(), sessionLocation: location, enabled: false },
          children,
        ),
    });
    expect(result.current.id).toBe("one");
    act(() => result.current.set("two", { replace: false }));
    expect(location.get()).toBe("two");
    expect(result.current.id).toBe("two");
  });

  it("reads a replacement location during the first render without a stale frame", () => {
    const observations: Array<string | null> = [];
    const transport = new MemoryCopilotTransport();

    function Reader() {
      const { id } = useCopilotSessionLocation();
      observations.push(id);
      return null;
    }

    function Runtime({
      children,
      location,
    }: {
      children: ReactNode;
      location: MemoryCopilotSessionLocation;
    }) {
      return createElement(
        CopilotProvider,
        { transport, sessionLocation: location, enabled: false },
        children,
      );
    }

    const firstLocation = new MemoryCopilotSessionLocation("one");
    const nextLocation = new MemoryCopilotSessionLocation("two");
    const view = render(
      createElement(Runtime, { location: firstLocation }, createElement(Reader)),
    );
    const observationCount = observations.length;

    view.rerender(
      createElement(Runtime, { location: nextLocation }, createElement(Reader)),
    );

    expect(observations[observationCount]).toBe("two");
  });
});
