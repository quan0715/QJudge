import { useCallback, useEffect, useRef } from "react";
import type {
  CopilotModel,
  CopilotModelCatalog,
  CopilotStorage,
  CopilotTransport,
} from "@/core/copilot";
import {
  LAST_MODEL_KEY,
  chooseModelId,
  toCopilotError,
} from "./copilotRuntimeHelpers";
import type { CopilotRuntimeStore } from "./useCopilotRuntimeStore";

interface CopilotModelCatalogInput {
  enabled: boolean;
  transport: CopilotTransport;
  storage: CopilotStorage | undefined;
  modelCatalog: CopilotModelCatalog | undefined;
  fallbackModels: readonly CopilotModel[];
}

/** Model catalog loading and the persisted model selection. */
export function useCopilotModelCatalog(
  store: CopilotRuntimeStore,
  {
    enabled,
    transport,
    storage,
    modelCatalog,
    fallbackModels,
  }: CopilotModelCatalogInput,
) {
  const {
    enabledRef,
    ownershipEpochRef,
    selectedModelIdRef,
    setModels,
    setModelStatus,
    setModelError,
    setSelectedModelId,
  } = store;
  const modelSelectionRevisionRef = useRef(0);
  const modelRequestRevisionRef = useRef(0);
  const modelRequestAbortRef = useRef<AbortController | null>(null);

  const commitModelSelection = useCallback(
    (id: string | null) => {
      selectedModelIdRef.current = id;
      setSelectedModelId(id);
      if (id) storage?.set(LAST_MODEL_KEY, id);
      else storage?.remove(LAST_MODEL_KEY);
    },
    [
      selectedModelIdRef,
      setSelectedModelId,
      storage,
    ],
  );

  const selectModel = useCallback(
    (id: string | null) => {
      if (!enabledRef.current) return;
      ++modelSelectionRevisionRef.current;
      commitModelSelection(id);
    },
    [
      commitModelSelection,
      enabledRef,
    ],
  );

  const invalidateModelRequest = useCallback(() => {
    modelRequestAbortRef.current?.abort();
    modelRequestAbortRef.current = null;
    ++modelRequestRevisionRef.current;
  }, []);

  const refreshModels = useCallback(async () => {
    invalidateModelRequest();
    if (!enabledRef.current) return;
    const ownershipEpoch = ownershipEpochRef.current;
    const requestRevision = modelRequestRevisionRef.current;
    const selectionRevision = modelSelectionRevisionRef.current;
    if (!modelCatalog) {
      const selectedId = chooseModelId(
        fallbackModels,
        storage?.get(LAST_MODEL_KEY) ?? null,
      );
      setModels(fallbackModels);
      commitModelSelection(selectedId);
      setModelError(null);
      setModelStatus("unavailable");
      return;
    }

    const controller = new AbortController();
    modelRequestAbortRef.current = controller;
    setModelStatus("loading");
    setModelError(null);
    try {
      const loadedModels = await modelCatalog.list({ signal: controller.signal });
      if (
        !enabledRef.current ||
        ownershipEpoch !== ownershipEpochRef.current ||
        controller.signal.aborted ||
        requestRevision !== modelRequestRevisionRef.current
      ) {
        return;
      }
      const explicitSelection = selectedModelIdRef.current;
      const selectedId =
        selectionRevision !== modelSelectionRevisionRef.current &&
        explicitSelection !== null &&
        loadedModels.some((model) => model.id === explicitSelection)
          ? explicitSelection
          : chooseModelId(
              loadedModels,
              storage?.get(LAST_MODEL_KEY) ?? null,
            );
      setModels(loadedModels);
      commitModelSelection(selectedId);
      setModelStatus("ready");
    } catch (cause) {
      if (
        !enabledRef.current ||
        ownershipEpoch !== ownershipEpochRef.current ||
        controller.signal.aborted ||
        requestRevision !== modelRequestRevisionRef.current
      ) {
        return;
      }
      const error = toCopilotError("load-models", cause);
      const explicitSelection = selectedModelIdRef.current;
      const selectedId =
        selectionRevision !== modelSelectionRevisionRef.current &&
        explicitSelection !== null &&
        fallbackModels.some((model) => model.id === explicitSelection)
          ? explicitSelection
          : chooseModelId(
              fallbackModels,
              storage?.get(LAST_MODEL_KEY) ?? null,
            );
      setModels(fallbackModels);
      commitModelSelection(selectedId);
      setModelError({ ...error, operation: "load-models" });
      setModelStatus("error");
    } finally {
      if (modelRequestAbortRef.current === controller) {
        modelRequestAbortRef.current = null;
      }
    }
  }, [
    commitModelSelection,
    enabledRef,
    fallbackModels,
    invalidateModelRequest,
    modelCatalog,
    ownershipEpochRef,
    selectedModelIdRef,
    setModelError,
    setModelStatus,
    setModels,
    storage,
  ]);

  useEffect(() => {
    if (!enabled) {
      invalidateModelRequest();
      setModelError(null);
      setModelStatus(modelCatalog ? "idle" : "unavailable");
      return;
    }
    void refreshModels();
    return invalidateModelRequest;
  }, [
    enabled,
    invalidateModelRequest,
    modelCatalog,
    refreshModels,
    setModelError,
    setModelStatus,
    transport,
  ]);

  return { selectModel, refreshModels, invalidateModelRequest };
}
