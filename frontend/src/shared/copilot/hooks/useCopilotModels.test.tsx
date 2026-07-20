import { act, renderHook, waitFor } from "@testing-library/react";
import type { CopilotModel, CopilotModelCatalog } from "@copilot";
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

class DeferredCopilotModelCatalog implements CopilotModelCatalog {
  signal: AbortSignal | undefined;
  private resolveList: ((models: readonly CopilotModel[]) => void) | undefined;
  private rejectList: ((error: unknown) => void) | undefined;

  list(options?: { signal?: AbortSignal }): Promise<readonly CopilotModel[]> {
    this.signal = options?.signal;
    return new Promise((resolve, reject) => {
      this.resolveList = resolve;
      this.rejectList = reject;
    });
  }

  resolve(models: readonly CopilotModel[]): void {
    this.resolveList?.(models);
  }

  reject(error: unknown): void {
    this.rejectList?.(error);
  }
}

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

  it("ignores an older catalog completion after the catalog changes", async () => {
    const olderCatalog = new DeferredCopilotModelCatalog();
    const newerCatalog = new DeferredCopilotModelCatalog();
    const newerModels = [{ id: "model-c", displayName: "Model C" }];
    let catalog: CopilotModelCatalog | undefined = olderCatalog;
    const wrapper = ({ children }: PropsWithChildren) => (
      <CopilotProvider
        transport={new MemoryCopilotTransport()}
        modelCatalog={catalog}
      >
        {children}
      </CopilotProvider>
    );
    const { result, rerender } = renderHook(() => useCopilotModels(), { wrapper });
    await waitFor(() => expect(olderCatalog.signal).toBeDefined());

    catalog = newerCatalog;
    rerender();
    await waitFor(() => expect(newerCatalog.signal).toBeDefined());
    await act(async () => newerCatalog.resolve(newerModels));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => olderCatalog.resolve(models));

    expect(olderCatalog.signal?.aborted).toBe(true);
    expect(result.current.models).toEqual(newerModels);
    expect(result.current.selectedModelId).toBe("model-c");
  });

  it("ignores an older catalog completion after the catalog is removed", async () => {
    const catalogRequest = new DeferredCopilotModelCatalog();
    const fallbackModels = [{ id: "fallback", displayName: "Fallback" }];
    let catalog: CopilotModelCatalog | undefined = catalogRequest;
    const wrapper = ({ children }: PropsWithChildren) => (
      <CopilotProvider
        transport={new MemoryCopilotTransport()}
        modelCatalog={catalog}
        fallbackModels={fallbackModels}
      >
        {children}
      </CopilotProvider>
    );
    const { result, rerender } = renderHook(() => useCopilotModels(), { wrapper });
    await waitFor(() => expect(catalogRequest.signal).toBeDefined());

    catalog = undefined;
    rerender();
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    await act(async () => catalogRequest.resolve(models));

    expect(catalogRequest.signal?.aborted).toBe(true);
    expect(result.current.models).toEqual(fallbackModels);
    expect(result.current.selectedModelId).toBe("fallback");
  });

  it("retains an explicit selection made while models load", async () => {
    const storage = new MemoryCopilotStorage();
    const catalog = new DeferredCopilotModelCatalog();
    const wrapper = ({ children }: PropsWithChildren) => (
      <CopilotProvider
        transport={new MemoryCopilotTransport()}
        storage={storage}
        modelCatalog={catalog}
        fallbackModels={models}
      >
        {children}
      </CopilotProvider>
    );
    const { result } = renderHook(() => useCopilotModels(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("loading"));

    act(() => result.current.select("model-a"));
    await act(async () => catalog.resolve(models));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.selectedModelId).toBe("model-a");
    expect(storage.get("copilot:last-model-id")).toBe("model-a");
  });

  it("retains an explicit selection in fallback models after catalog failure", async () => {
    const storage = new MemoryCopilotStorage();
    const catalog = new DeferredCopilotModelCatalog();
    const wrapper = ({ children }: PropsWithChildren) => (
      <CopilotProvider
        transport={new MemoryCopilotTransport()}
        storage={storage}
        modelCatalog={catalog}
        fallbackModels={models}
      >
        {children}
      </CopilotProvider>
    );
    const { result } = renderHook(() => useCopilotModels(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("loading"));

    act(() => result.current.select("model-a"));
    await act(async () => catalog.reject(new Error("offline")));
    await waitFor(() => expect(result.current.status).toBe("error"));

    expect(result.current.selectedModelId).toBe("model-a");
    expect(storage.get("copilot:last-model-id")).toBe("model-a");
  });

  it("aborts an in-flight catalog request on unmount", async () => {
    const catalog = new DeferredCopilotModelCatalog();
    const wrapper = ({ children }: PropsWithChildren) => (
      <CopilotProvider
        transport={new MemoryCopilotTransport()}
        modelCatalog={catalog}
      >
        {children}
      </CopilotProvider>
    );
    const { unmount } = renderHook(() => useCopilotModels(), { wrapper });
    await waitFor(() => expect(catalog.signal).toBeDefined());

    unmount();
    catalog.resolve(models);

    expect(catalog.signal?.aborted).toBe(true);
  });
});
