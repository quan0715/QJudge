import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryCopilotSessionLocation, MemoryCopilotTransport } from "../testing";
import { CopilotProvider } from "../react/CopilotProvider";
import { useCopilotSessionLocation } from "./useCopilotSessionLocation";

describe("useCopilotSessionLocation", () => {
  it("reads and writes the configured location port", async () => {
    const location = new MemoryCopilotSessionLocation("one");
    const { result } = renderHook(() => useCopilotSessionLocation(), {
      wrapper: ({ children }) => (
        <CopilotProvider transport={new MemoryCopilotTransport()} sessionLocation={location}>
          {children}
        </CopilotProvider>
      ),
    });
    expect(result.current.id).toBe("one");
    act(() => result.current.set("two", { replace: false }));
    expect(location.get()).toBe("two");
  });
});
