import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  createCopilotRuntimeState,
  selectActiveRun,
  selectActiveSession,
  type CopilotModel,
  type CopilotModelCatalog,
  type CopilotSendResult,
  type CopilotSessionLocation,
  type CopilotSessionSummary,
  type CopilotStorage,
  type CopilotTransport,
  type CopilotTranslations,
} from "@/core/copilot";
import { DefaultCopilotTranslations } from "../translations/defaultCopilotTranslations";
import {
  CopilotComposerContext,
  CopilotModelContext,
  CopilotRunCommandsContext,
  CopilotSessionCommandsContext,
  CopilotStateContext,
} from "./copilotContexts";
import {
  LAST_MODEL_KEY,
  LAST_SESSION_KEY,
  chooseModelId,
  claimStorage,
} from "./copilotRuntimeHelpers";
import type { CopilotInitialSessionStrategy } from "./copilotSessionBootstrap";
import { useCopilotModelCatalog } from "./useCopilotModelCatalog";
import { useCopilotRunCommands } from "./useCopilotRunCommands";
import { useCopilotRunSubscription } from "./useCopilotRunSubscription";
import { useCopilotRuntimeStore } from "./useCopilotRuntimeStore";
import { useCopilotSessionCommands } from "./useCopilotSessionCommands";

const EMPTY_MODELS: readonly CopilotModel[] = [];
const EMPTY_SESSION_SUMMARIES: readonly CopilotSessionSummary[] = [];
const defaultTranslations = new DefaultCopilotTranslations();
let optimisticSequence = 0;
const EMPTY_ACTIVE_SESSION = {
  status: "empty",
  id: null,
  data: null,
  error: null,
} as const;
const INITIALIZING_ACTIVE_SESSION = {
  status: "initializing",
  id: null,
  data: null,
  error: null,
} as const;
const EMPTY_RUN_STATE = { status: "ready", run: null } as const;

export interface CopilotProviderProps {
  transport: CopilotTransport;
  sessionLocation?: CopilotSessionLocation;
  storage?: CopilotStorage;
  modelCatalog?: CopilotModelCatalog;
  fallbackModels?: readonly CopilotModel[];
  translations?: CopilotTranslations;
  initialSession?: CopilotInitialSessionStrategy;
  enabled?: boolean;
  /**
   * Identity of the account that owns persisted selections. When provided,
   * disabling the provider only suspends the runtime and keeps the last
   * session/model; they are dropped once a different owner enables it. When
   * omitted, every disable is treated as an ownership boundary.
   */
  ownerKey?: string | null;
  /**
   * Host-supplied metadata merged into every started run, read at start time
   * so it reflects where the user is when the message is sent.
   */
  getRunMetadata?: () => Record<string, unknown>;
  children: ReactNode;
}

export function CopilotProvider({
  transport,
  sessionLocation,
  storage,
  modelCatalog,
  fallbackModels = EMPTY_MODELS,
  translations = defaultTranslations,
  initialSession = "none",
  enabled = true,
  ownerKey,
  getRunMetadata,
  children,
}: CopilotProviderProps) {
  const store = useCopilotRuntimeStore({
    enabled,
    storage,
    ownerKey,
    modelCatalog,
    fallbackModels,
  });
  const {
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
    lastSendRef,
    lazyCreateInFlightRef,
    interactionSubmissionRef,
  } = store;
  const ownershipRef = useRef<{
    enabled: boolean;
    transport: CopilotTransport;
    ownerKey: string | null | undefined;
  } | null>(null);
  const composerSendInFlightRef = useRef<Promise<CopilotSendResult> | null>(null);

  const { selectModel, refreshModels, invalidateModelRequest } =
    useCopilotModelCatalog(store, {
      enabled,
      transport,
      storage,
      modelCatalog,
      fallbackModels,
    });
  const subscription = useCopilotRunSubscription(store, transport);
  const { closeRunSubscription } = subscription;
  const {
    writeLocation,
    invalidateSessionListRequest,
    selectSession,
    startNew,
    create,
    ensureSessionForSend,
    refresh,
    rename,
    remove,
    clearSessionError,
  } = useCopilotSessionCommands(store, {
    enabled,
    transport,
    sessionLocation,
    storage,
    initialSession,
    subscription,
  });
  const { send, stop, submitApproval, submitAnswer, retry, clearError } =
    useCopilotRunCommands(store, {
      transport,
      getRunMetadata,
      subscription,
      ensureSessionForSend,
    });

  const resetRuntimeOwnership = useCallback((clearPersisted: boolean) => {
    ++ownershipEpochRef.current;
    ++revisionRef.current;
    invalidateModelRequest();
    invalidateSessionListRequest();
    closeRunSubscription();
    activeIdRef.current = null;
    newSessionIntentRef.current = false;
    sessionsRef.current = [];
    summaryRunBySessionRef.current = {};
    summaryTerminalRunIdBySessionRef.current = {};
    summaryRunRevisionBySessionRef.current = {};
    summaryRunRevisionRef.current = 0;
    summarySequenceByRunRef.current = {};
    lastSendRef.current = null;
    composerSendInFlightRef.current = null;
    lazyCreateInFlightRef.current = null;
    interactionSubmissionRef.current = null;
    const emptyRuntime = createCopilotRuntimeState();
    runtimeRef.current = emptyRuntime;
    setRuntime(emptyRuntime);
    setSessions([]);
    setListStatus("idle");
    setActiveError(null);
    setSessionError(null);
    setDraft("");
    setAttachments([]);
    setIsComposerSending(false);
    setModels(fallbackModels);
    setModelStatus(modelCatalog ? "idle" : "unavailable");
    setModelError(null);
    if (clearPersisted) {
      storage?.remove(LAST_MODEL_KEY);
      storage?.remove(LAST_SESSION_KEY);
    }
    const fallbackModelId = chooseModelId(fallbackModels, null);
    selectedModelIdRef.current = fallbackModelId;
    setSelectedModelId(fallbackModelId);
    writeLocation(null);
  }, [
    activeIdRef,
    closeRunSubscription,
    fallbackModels,
    interactionSubmissionRef,
    invalidateModelRequest,
    invalidateSessionListRequest,
    lastSendRef,
    lazyCreateInFlightRef,
    modelCatalog,
    newSessionIntentRef,
    ownershipEpochRef,
    revisionRef,
    runtimeRef,
    selectedModelIdRef,
    sessionsRef,
    setActiveError,
    setAttachments,
    setDraft,
    setIsComposerSending,
    setListStatus,
    setModelError,
    setModelStatus,
    setModels,
    setRuntime,
    setSelectedModelId,
    setSessionError,
    setSessions,
    storage,
    summaryRunBySessionRef,
    summaryRunRevisionBySessionRef,
    summaryRunRevisionRef,
    summarySequenceByRunRef,
    summaryTerminalRunIdBySessionRef,
    writeLocation,
  ]);

  useLayoutEffect(() => {
    const previous = ownershipRef.current;
    ownershipRef.current = { enabled, transport, ownerKey };
    if (previous !== null) {
      const transportChanged = previous.transport !== transport;
      const disabled = previous.enabled && !enabled;
      const ownerChanged = enabled && previous.ownerKey !== ownerKey;
      if (disabled || (enabled && transportChanged) || ownerChanged) {
        const clearPersisted =
          ownerKey === undefined && (disabled || transportChanged);
        resetRuntimeOwnership(clearPersisted);
      }
    }
    // Runs before the passive effects that read persisted selections.
    if (enabled) claimStorage(storage, ownerKey);
  }, [enabled, ownerKey, resetRuntimeOwnership, storage, transport]);

  const addAttachments = useCallback(async (files: readonly File[]) => {
    if (!enabledRef.current) return;
    setAttachments((items) => [
      ...items,
      ...files.map((file) => ({
        id: `copilot-attachment-${++optimisticSequence}`,
        file,
        status: "pending" as const,
      })),
    ]);
  }, [
    enabledRef,
    setAttachments,
  ]);

  const removeAttachment = useCallback((id: string) => {
    if (!enabledRef.current) return;
    setAttachments((items) => items.filter((item) => item.id !== id));
  }, [
    enabledRef,
    setAttachments,
  ]);

  const setComposerDraft = useCallback((value: string) => {
    if (!enabledRef.current) return;
    setDraft(value);
  }, [
    enabledRef,
    setDraft,
  ]);

  const resetComposer = useCallback(() => {
    setDraft("");
    setAttachments([]);
  }, [
    setAttachments,
    setDraft,
  ]);

  const runtimeIsVisible =
    enabled &&
    (ownershipRef.current === null ||
      ownershipRef.current.transport === transport);
  const selectedActiveSession = runtimeIsVisible
    ? selectActiveSession(runtime, activeError)
    : EMPTY_ACTIVE_SESSION;
  const activeSession =
    runtimeIsVisible &&
    enabled &&
    !newSessionIntentRef.current &&
    selectedActiveSession.status === "empty" &&
    (listStatus === "idle" || listStatus === "loading")
      ? INITIALIZING_ACTIVE_SESSION
      : selectedActiveSession;
  const run = runtimeIsVisible ? selectActiveRun(runtime) : EMPTY_RUN_STATE;
  const stateValue = useMemo(
    () => ({
      transport,
      translations,
      capabilities: transport.capabilities,
      sessionLocation,
      sessions: runtimeIsVisible ? sessions : EMPTY_SESSION_SUMMARIES,
      listStatus: runtimeIsVisible ? listStatus : "idle",
      sessionError: runtimeIsVisible ? sessionError : null,
      activeSession,
      run,
    }),
    [
      activeSession,
      listStatus,
      run,
      runtimeIsVisible,
      sessionError,
      sessionLocation,
      sessions,
      translations,
      transport,
    ],
  );
  const commandsValue = useMemo(
    () => ({
      create,
      startNew,
      select: selectSession,
      rename,
      remove,
      refresh,
      clearError: clearSessionError,
    }),
    [clearSessionError, create, refresh, remove, rename, selectSession, startNew],
  );
  const runCommandsValue = useMemo(
    () => ({ send, stop, submitApproval, submitAnswer, retry, clearError }),
    [clearError, retry, send, stop, submitAnswer, submitApproval],
  );
  const sessionAcceptsInput =
    activeSession.status === "ready" || activeSession.status === "empty";
  const canSend =
    runtimeIsVisible &&
    enabled &&
    sessionAcceptsInput &&
    (run.status === "ready" || run.status === "error") &&
    !isComposerSending &&
    (draft.trim().length > 0 || attachments.length > 0);
  const sendComposer = useCallback((): Promise<CopilotSendResult> => {
    if (composerSendInFlightRef.current) {
      return composerSendInFlightRef.current;
    }

    const capturedDraft = draft;
    const capturedAttachments = attachments;
    const capturedAttachmentIds = new Set(
      capturedAttachments.map((item) => item.id),
    );
    const input = {
      text: capturedDraft,
      attachments: capturedAttachments.map((item) => item.file),
      modelId: selectedModelIdRef.current ?? undefined,
    };
    setIsComposerSending(true);
    const inFlight = send(input).then((result) => {
      if (result.accepted) {
        setDraft((current) => current === capturedDraft ? "" : current);
        setAttachments((current) =>
          current.filter((item) => !capturedAttachmentIds.has(item.id)),
        );
      }
      return result;
    });
    composerSendInFlightRef.current = inFlight;
    const clearInFlight = () => {
      if (composerSendInFlightRef.current === inFlight) {
        composerSendInFlightRef.current = null;
        setIsComposerSending(false);
      }
    };
    void inFlight.then(clearInFlight, clearInFlight);
    return inFlight;
  }, [
    attachments,
    draft,
    selectedModelIdRef,
    send,
    setAttachments,
    setDraft,
    setIsComposerSending,
  ]);
  const composerValue = useMemo(
    () => ({
      draft: runtimeIsVisible ? draft : "",
      attachments: runtimeIsVisible ? attachments : [],
      canSend,
      isSending: runtimeIsVisible ? isComposerSending : false,
      setDraft: setComposerDraft,
      addAttachments,
      removeAttachment,
      send: sendComposer,
      reset: resetComposer,
    }),
    [
      addAttachments,
      attachments,
      canSend,
      draft,
      isComposerSending,
      removeAttachment,
      resetComposer,
      runtimeIsVisible,
      sendComposer,
      setComposerDraft,
    ],
  );
  const modelValue = useMemo(
    () => {
      const fallbackModelId = chooseModelId(fallbackModels, null);
      return {
        models: runtimeIsVisible ? models : fallbackModels,
        status: runtimeIsVisible
          ? modelStatus
          : modelCatalog
            ? "idle"
            : "unavailable",
        selectedModelId: runtimeIsVisible ? selectedModelId : fallbackModelId,
        error: runtimeIsVisible ? modelError : null,
        select: selectModel,
        refresh: refreshModels,
      };
    },
    [
      fallbackModels,
      modelError,
      modelCatalog,
      models,
      modelStatus,
      refreshModels,
      selectModel,
      selectedModelId,
      runtimeIsVisible,
    ],
  );

  return (
    <CopilotStateContext.Provider value={stateValue}>
      <CopilotSessionCommandsContext.Provider value={commandsValue}>
        <CopilotRunCommandsContext.Provider value={runCommandsValue}>
          <CopilotModelContext.Provider value={modelValue}>
            <CopilotComposerContext.Provider value={composerValue}>
              {children}
            </CopilotComposerContext.Provider>
          </CopilotModelContext.Provider>
        </CopilotRunCommandsContext.Provider>
      </CopilotSessionCommandsContext.Provider>
    </CopilotStateContext.Provider>
  );
}
