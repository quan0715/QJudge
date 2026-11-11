import { useRef, useState } from "react";
import {
  createCopilotRuntimeState,
  type CopilotError,
  type CopilotModel,
  type CopilotModelCatalog,
  type CopilotModelStatus,
  type CopilotPendingAttachment,
  type CopilotRun,
  type CopilotSendInput,
  type CopilotSessionSummary,
  type CopilotStorage,
} from "@/core/copilot";
import type { CopilotSessionListStatus } from "./copilotContexts";
import {
  LAST_MODEL_KEY,
  chooseModelId,
  isStorageOwnedBy,
  type CreateSessionOutcome,
} from "./copilotRuntimeHelpers";

interface CopilotRuntimeStoreInput {
  enabled: boolean;
  storage: CopilotStorage | undefined;
  ownerKey: string | null | undefined;
  modelCatalog: CopilotModelCatalog | undefined;
  fallbackModels: readonly CopilotModel[];
}

/** State and refs shared by the provider and its runtime hooks. */
export function useCopilotRuntimeStore({
  enabled,
  storage,
  ownerKey,
  modelCatalog,
  fallbackModels,
}: CopilotRuntimeStoreInput) {
  const [runtime, setRuntime] = useState(createCopilotRuntimeState);
  const runtimeRef = useRef(runtime);
  // eslint-disable-next-line react-hooks/refs -- latest-value ref, written during render
  runtimeRef.current = runtime;
  const [sessions, setSessions] = useState<CopilotSessionSummary[]>([]);
  const [listStatus, setListStatus] =
    useState<CopilotSessionListStatus>("idle");
  const [activeError, setActiveError] = useState<CopilotError | null>(null);
  const [sessionError, setSessionError] = useState<CopilotError | null>(null);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<CopilotPendingAttachment[]>([]);
  const [isComposerSending, setIsComposerSending] = useState(false);
  const [models, setModels] = useState<readonly CopilotModel[]>(fallbackModels);
  const [modelStatus, setModelStatus] = useState<CopilotModelStatus>(
    modelCatalog ? "idle" : "unavailable",
  );
  const [modelError, setModelError] = useState<CopilotError | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(() =>
    chooseModelId(
      fallbackModels,
      enabled && isStorageOwnedBy(storage, ownerKey)
        ? (storage?.get(LAST_MODEL_KEY) ?? null)
        : null,
    ),
  );
  const selectedModelIdRef = useRef(selectedModelId);
  // eslint-disable-next-line react-hooks/refs -- latest-value ref, written during render
  selectedModelIdRef.current = selectedModelId;
  const enabledRef = useRef(enabled);
  // eslint-disable-next-line react-hooks/refs -- latest-value ref, written during render
  enabledRef.current = enabled;
  const ownershipEpochRef = useRef(0);
  const revisionRef = useRef(0);
  const activeIdRef = useRef<string | null>(null);
  const newSessionIntentRef = useRef(false);
  const sessionsRef = useRef<CopilotSessionSummary[]>([]);
  const summaryRunBySessionRef = useRef<Record<string, CopilotRun | null>>({});
  const summaryTerminalRunIdBySessionRef = useRef<Record<string, string>>({});
  const summaryRunRevisionBySessionRef = useRef<Record<string, number>>({});
  const summaryRunRevisionRef = useRef(0);
  const summarySequenceByRunRef = useRef<Record<string, number>>({});
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSendRef = useRef<(CopilotSendInput & { optimisticId?: string }) | null>(null);
  const lazyCreateInFlightRef = useRef<Promise<CreateSessionOutcome> | null>(null);
  const interactionSubmissionRef = useRef<{
    key: string;
    promise: Promise<void>;
  } | null>(null);

  return {
    runtime,
    setRuntime,
    runtimeRef,
    sessions,
    setSessions,
    sessionsRef,
    listStatus,
    setListStatus,
    activeError,
    setActiveError,
    sessionError,
    setSessionError,
    draft,
    setDraft,
    attachments,
    setAttachments,
    isComposerSending,
    setIsComposerSending,
    models,
    setModels,
    modelStatus,
    setModelStatus,
    modelError,
    setModelError,
    selectedModelId,
    setSelectedModelId,
    selectedModelIdRef,
    enabledRef,
    ownershipEpochRef,
    revisionRef,
    activeIdRef,
    newSessionIntentRef,
    summaryRunBySessionRef,
    summaryTerminalRunIdBySessionRef,
    summaryRunRevisionBySessionRef,
    summaryRunRevisionRef,
    summarySequenceByRunRef,
    reconnectTimerRef,
    lastSendRef,
    lazyCreateInFlightRef,
    interactionSubmissionRef,
  };
}

export type CopilotRuntimeStore = ReturnType<typeof useCopilotRuntimeStore>;
