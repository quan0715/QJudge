import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ContestIntegrityRun, ExamRuntimeState } from "@/core/entities/contest.entity";
import type { IntegritySignalEmitter } from "../anticheat/integrity/IntegrityRuntimeContext";
import { asIntegritySignalDispatch, INTEGRITY_SIGNAL_EVENT } from "../anticheat/integrity/IntegrityRuntimeContext";
import type { UseIntegrityRuntimeOptions } from "../anticheat/integrity/useIntegrityRuntime";
import { ResidentIntegritySession, type IntegrityUploadMode } from "../anticheat/integrity/residentIntegritySession";
import { getDeviceId } from "@/infrastructure/api/http.client";
import { EXAM_SUBMITTED_EVENT } from "@/infrastructure/api/repositories/exam.repository";

interface UploadOwner {
  resident: boolean;
  captureReady: boolean;
  emitter: IntegritySignalEmitter;
  configure: (options: UseIntegrityRuntimeOptions | null) => void;
  flush: () => Promise<void>;
}
const UploadContext = createContext<UploadOwner | null>(null);
export const useIntegrityUploadOwner = () => useContext(UploadContext);
const active = (state: ExamRuntimeState | null) => ["in_progress", "paused", "locked"].includes(state?.exam_status ?? "");

export function IntegrityUploadProvider({ contestId, runtimeState, children }: {
  contestId: string; runtimeState: ExamRuntimeState | null; children: ReactNode;
}) {
  const { t } = useTranslation("contest");
  const [run, setRun] = useState<ContestIntegrityRun | undefined>();
  const config = useRef<UseIntegrityRuntimeOptions | null>(null);
  const owner = useRef<ResidentIntegritySession | null>(null);
  const ownerScope = useRef<string | null>(null);
  const earlySignals = useRef<Array<{ scope: string; signal: Parameters<IntegritySignalEmitter["emit"]>[0] }>>([]);
  const [gap, setGap] = useState(false);
  const [localLoss, setLocalLoss] = useState(false);
  const [completedScope, setCompletedScope] = useState<string | null>(null);
  const [submittedAttempt, setSubmittedAttempt] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now());
  const resident = !!runtimeState?.integrity_run;
  const identity = runtimeState?.session_identity;
  const scopeKey = JSON.stringify([contestId, runtimeState?.integrity_run?.id,
    runtimeState?.participant_id, identity?.device_id, identity?.attempt_id]);
  const currentScope = useRef(scopeKey);
  currentScope.current = scopeKey;
  const complete = completedScope === scopeKey;
  const scopeReady = resident && !!run && run.id === runtimeState?.integrity_run?.id &&
    run.participantId === runtimeState.participant_id && !!run.registrySnapshot?.version &&
    !!run.policySnapshot && identity?.device_id === getDeviceId() && !!identity?.attempt_id &&
    Number.isSafeInteger(identity.next_sequence) && identity.next_sequence! > 0;
  const grant = runtimeState?.integrity_upload;
  const now = clock + (runtimeState?.serverOffsetMs ?? 0);
  const mode: IntegrityUploadMode = complete || grant?.upload_status === "complete" ? "off"
    : active(runtimeState) && identity?.active_device_matches && submittedAttempt !== identity.attempt_id ? "capture"
      : grant?.upload_status === "pending" && now < Date.parse(grant.accept_until) ? "drain" : "off";
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const captureReady = scopeReady && mode === "capture";

  const configure = useCallback((next: UseIntegrityRuntimeOptions | null) => {
    config.current = next;
    const nextRun = next?.integrityRun;
    if (nextRun) setRun((previous) => previous?.id === nextRun.id &&
      previous?.registrySnapshot.version === nextRun.registrySnapshot.version ? previous : nextRun);
    if (ownerScope.current === currentScope.current) owner.current?.setSources(next?.evidenceSources ?? {});
  }, []);
  const emitter = useMemo<IntegritySignalEmitter>(() => ({
    emit: (signal) => {
      if (modeRef.current !== "capture") return Promise.resolve();
      // Child entry effects run before this provider replaces the previous
      // session. Never dispatch a new attempt's signal to an old/off owner.
      if (owner.current && ownerScope.current === currentScope.current) return owner.current.emitter.emit(signal);
      if (earlySignals.current.length < 128) earlySignals.current.push({ scope: currentScope.current, signal });
      else { setGap(true); setLocalLoss(true); }
      // Entry must remain usable while persistence is starting. These pending
      // records are not represented as durable until the owner appends them.
      return Promise.resolve();
    },
    updateHealth: (update) => {
      if (ownerScope.current === currentScope.current) owner.current?.emitter.updateHealth?.(update);
    },
  }), []);
  const flush = useCallback(async () => { await owner.current?.flush(); }, []);

  useEffect(() => {
    if (!resident) return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [resident]);

  const runId = run?.id;
  const attemptId = identity?.attempt_id;
  const deviceId = identity?.device_id;
  useLayoutEffect(() => {
    const submitted = (event: Event) => {
      if ((event as CustomEvent).detail?.contestId !== contestId) return;
      modeRef.current = "off";
      setSubmittedAttempt(attemptId ?? null);
      void owner.current?.setMode("off");
    };
    window.addEventListener(EXAM_SUBMITTED_EVENT, submitted);
    return () => window.removeEventListener(EXAM_SUBMITTED_EVENT, submitted);
  }, [contestId, attemptId]);
  useEffect(() => {
    if (!scopeReady || !run || !deviceId || !attemptId || !identity?.next_sequence) return;
    const session = new ResidentIntegritySession({ contestId, run,
      scope: { run_id: run.id, participant_id: run.participantId!, device_id: deviceId, attempt_id: attemptId },
      nextSequence: identity.next_sequence, mode: modeRef.current,
      snapshotProvider: () => config.current?.snapshotProvider() ?? { pageVisible: document.visibilityState !== "hidden",
        online: navigator.onLine, fullscreen: false, screenCapture: "disabled", webcamCapture: "disabled", activeSourceDescriptors: [] },
      onGap: () => setGap(true),
      onLocalLoss: () => setLocalLoss(true),
      onProgress: (ack) => {
        if (ack.uploadStatus === "complete" && currentScope.current === scopeKey) setCompletedScope(scopeKey);
      },
    });
    owner.current = session;
    ownerScope.current = scopeKey;
    session.setSources(config.current?.evidenceSources ?? {});
    void session.start();
    for (const pendingSignal of earlySignals.current.splice(0)) {
      if (pendingSignal.scope === scopeKey) void session.emitter.emit(pendingSignal.signal);
      else { setGap(true); setLocalLoss(true); }
    }
    return () => {
      owner.current = null;
      ownerScope.current = null;
      void session.close(); // Closes handles after pending work; never deletes local data.
    };
    // The immutable scope owns resources. Poll objects, schedule and streams do not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contestId, scopeReady, runId, attemptId, deviceId, scopeKey]);

  useLayoutEffect(() => {
    if (ownerScope.current === scopeKey) void owner.current?.setMode(mode);
  }, [mode, scopeKey]);
  useLayoutEffect(() => {
    if (!resident) return;
    const relay = (event: Event) => {
      const detail = asIntegritySignalDispatch(event);
      if (detail) detail.completion = emitter.emit(detail.signal);
    };
    window.addEventListener(INTEGRITY_SIGNAL_EVENT, relay);
    return () => window.removeEventListener(INTEGRITY_SIGNAL_EVENT, relay);
  }, [resident, emitter]);

  const pending = resident && !complete && grant?.upload_status !== "complete";
  useEffect(() => {
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);
  const value = useMemo(() => ({ resident, captureReady, emitter, configure, flush }), [resident, captureReady, emitter, configure, flush]);
  return <UploadContext.Provider value={value}>
    {children}
    {resident && localLoss ? <div role="status" data-testid="integrity-local-data-loss">
      {t("exam.integrityLocalDataLoss", "部分監考事件或影音未能錄製或保存，可能無法補傳；這不同於待傳送資料，完成上傳也不代表缺漏已恢復。可繼續作答與交卷。")}
    </div> : null}
    {pending && (gap || !active(runtimeState) || submittedAttempt === attemptId) ? <div role="status" data-testid="integrity-upload-status">
      {grant?.upload_status === "expired" || (grant && now >= Date.parse(grant.accept_until))
        ? t("exam.integrityUploadExpired", "監考資料補傳期限已到，仍有未完成的資料；交卷結果不受影響，已保存的本機資料會保留。")
        : t("exam.integrityUploadPending", "監考資料尚未完成傳送；可繼續作答與交卷。離開頁面後傳送會停止，已保存的本機資料會保留。")}
    </div> : null}
  </UploadContext.Provider>;
}

/** Capture registration has no ownership of the outbox or transport. */
export function useIntegrityCaptureRegistration(options: UseIntegrityRuntimeOptions): UploadOwner | null {
  const owner = useIntegrityUploadOwner();
  const latest = useRef(options);
  useLayoutEffect(() => { latest.current = options; });
  useLayoutEffect(() => {
    if (!owner?.resident) return;
    owner.configure({ ...latest.current, snapshotProvider: () => latest.current.snapshotProvider() });
    return () => owner.configure(null);
  }, [owner?.resident, owner?.configure, options.enabled, options.integrityRun?.id,
    options.evidenceSources?.screen_share, options.evidenceSources?.webcam]);
  return owner;
}
