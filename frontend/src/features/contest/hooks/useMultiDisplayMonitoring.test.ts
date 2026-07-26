import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMultiDisplayMonitoring } from "./useMultiDisplayMonitoring";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe("useMultiDisplayMonitoring", () => {
  it("keeps the browser detector check API while exposing no countdown authority", () => {
    const emitter = { emit: vi.fn().mockResolvedValue(undefined) };
    const { result } = renderHook(() => useMultiDisplayMonitoring({
      enabled: false,
      examSubmitted: false,
      emitter,
    }));
    result.current.triggerCheck();
    expect(result.current.interrupted).toBe(false);
  });
});
