import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { useEditorPaneScrollSelection } from "./useEditorPaneScrollSelection";

function useHarness(itemsKey: string) {
  const [selectedId, setSelectedId] = useState<string | null>("a");
  const selection = useEditorPaneScrollSelection(selectedId, setSelectedId, itemsKey);
  return { ...selection, setSelectedId };
}

describe("useEditorPaneScrollSelection explicit selection", () => {
  it("tracks only selections made from the list", () => {
    const { result } = renderHook(({ itemsKey }) => useHarness(itemsKey), {
      initialProps: { itemsKey: "a,b,c" },
    });
    expect(result.current.explicitSelectedId).toBeNull();

    act(() => result.current.setSelectedId("c"));
    expect(result.current.explicitSelectedId).toBeNull();

    act(() => result.current.handleSelect("b"));
    expect(result.current.explicitSelectedId).toBe("b");

    act(() => result.current.setSelectedId("c"));
    expect(result.current.explicitSelectedId).toBe("b");
  });

  it("drops the explicit selection when that item is removed", () => {
    const { result, rerender } = renderHook(({ itemsKey }) => useHarness(itemsKey), {
      initialProps: { itemsKey: "a,b,c" },
    });
    act(() => result.current.handleSelect("b"));

    rerender({ itemsKey: "a,c" });

    expect(result.current.explicitSelectedId).toBeNull();
  });
});
