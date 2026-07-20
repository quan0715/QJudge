import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it } from "vitest";
import { MemoryCopilotModelCatalog } from "@copilot/testing";
import { MemoryCopilotStorage } from "@copilot/testing";
import { MemoryCopilotTransport } from "@copilot/testing";
import { CopilotProvider } from "../react/CopilotProvider";
import { useCopilotModels } from "./useCopilotModels";

const models = [
  { id: "model-a", displayName: "Model A" },
  { id: "model-b", displayName: "Model B", isDefault: true },
];

describe("useCopilotModels", () => {
  it("restores a valid stored model", async () => {
    const storage = new MemoryCopilotStorage();
    storage.set("copilot:last-model-id", "model-a");
    const catalog = new MemoryCopilotModelCatalog(models);
    const wrapper = ({ children }: PropsWithChildren) => (
      <CopilotProvider
        transport={new MemoryCopilotTransport()}
        storage={storage}
        modelCatalog={catalog}
      >
        {children}
      </CopilotProvider>
    );

    const { result } = renderHook(() => useCopilotModels(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.models).toEqual(models);
    expect(result.current.selectedModelId).toBe("model-a");
  });

  it("uses fallback models when the catalog fails", async () => {
    const catalog = new MemoryCopilotModelCatalog();
    catalog.fail(new Error("offline"));
    const wrapper = ({ children }: PropsWithChildren) => (
      <CopilotProvider
        transport={new MemoryCopilotTransport()}
        modelCatalog={catalog}
        fallbackModels={models}
      >
        {children}
      </CopilotProvider>
    );

    const { result } = renderHook(() => useCopilotModels(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("error"));

    expect(result.current.models).toEqual(models);
    expect(result.current.selectedModelId).toBe("model-b");
    expect(result.current.error?.operation).toBe("load-models");
  });

  it("persists an explicit selection", async () => {
    const storage = new MemoryCopilotStorage();
    const wrapper = ({ children }: PropsWithChildren) => (
      <CopilotProvider
        transport={new MemoryCopilotTransport()}
        storage={storage}
        modelCatalog={new MemoryCopilotModelCatalog(models)}
      >
        {children}
      </CopilotProvider>
    );
    const { result } = renderHook(() => useCopilotModels(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => result.current.select("model-a"));

    expect(storage.get("copilot:last-model-id")).toBe("model-a");
  });
});
