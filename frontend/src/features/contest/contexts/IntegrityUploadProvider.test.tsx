import "fake-indexeddb/auto";
import { act, render, screen, waitFor } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { IntegrityUploadProvider, useIntegrityUploadOwner } from "./IntegrityUploadProvider";
import { IndexedDbIntegrityOutbox } from "@/infrastructure/browser/integrity/indexedDbIntegrityOutbox";
import { OpfsEvidenceStore } from "@/infrastructure/browser/integrity/opfsEvidenceStore";
import { getDeviceId } from "@/infrastructure/api/http.client";
import { endExam } from "@/infrastructure/api/repositories/exam.repository";
import type { ExamRuntimeState } from "@/core/entities/contest.entity";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(["storage", "network"])("keeps answer DOM/outbox through submit and completion without erasing %s failure semantics", async (failure) => {
  vi.mocked(localStorage.getItem).mockReturnValue("device-a");
  const runId = crypto.randomUUID();
  const run = { id: runId, participantId: 44, sessionState: "active", health: "unhealthy",
    registrySnapshot: { version: "v1", definitions: {} }, policySnapshot: {}, devicePolicy: {} as never };
  const open = vi.spyOn(IndexedDbIntegrityOutbox, "open");
  const append = vi.spyOn(IndexedDbIntegrityOutbox.prototype, "append");
  let currentOwner: ReturnType<typeof useIntegrityUploadOwner>;
  const mediaOpen = vi.spyOn(OpfsEvidenceStore, "open");
  if (failure === "storage") mediaOpen.mockRejectedValue(new Error("local media unavailable"));
  else mediaOpen.mockResolvedValue({ reconcile: async () => {}, listDescriptors: async () => [],
    pendingDescriptorSummaries: async () => [], markReported: async () => {}, close: async () => {} } as unknown as OpfsEvidenceStore);
  const requests: Record<string, unknown>[] = [];
  let uploadComplete = false;
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    requests.push(JSON.parse(init.body));
    if (failure === "network" && requests.length === 1) return new Response("unavailable", { status: 503 });
    return new Response(JSON.stringify({ acked_through_seq: 100, processed_through_seq: 100,
      pending_commands: [], release_evidence_before_ms: 0, upload_status: uploadComplete ? "complete" : "pending" }), { status: 200 });
  }));
  let state: ExamRuntimeState = { server_now: new Date().toISOString(), serverOffsetMs: 0,
    start_time: null, end_time: new Date(Date.now() + 60000).toISOString(), schedule_revision: 1,
    participant_id: 44, exam_status: "in_progress", integrity_run: { id: runId,
      session_state: "active", schedule_revision: 1, health: "unhealthy", accept_until: null },
    session_identity: { active_device_matches: true, device_id: getDeviceId(), attempt_id: crypto.randomUUID(), next_sequence: 1 }, integrity_upload: null };
  const Answer = () => {
    const owner = useIntegrityUploadOwner();
    useLayoutEffect(() => { currentOwner = owner; });
    useLayoutEffect(() => { owner?.configure({ enabled: true, contestId: "1", integrityRun: run,
      snapshotProvider: () => ({ pageVisible: true, online: true, fullscreen: false,
        screenCapture: "disabled", webcamCapture: "disabled", activeSourceDescriptors: [] }) });
      void owner?.emitter.emit({ eventType: "exam_entered", clientOccurredAtMs: 1000, payload: {} });
      return () => owner?.configure(null);
    }, [owner?.configure]);
    return <input aria-label="answer" defaultValue="saved answer" />;
  };
  const tree = (answer: boolean) => <IntegrityUploadProvider contestId="1" runtimeState={state}>{answer ? <Answer /> : <p>Submitted</p>}</IntegrityUploadProvider>;
  const { rerender, unmount } = render(tree(true));
  const input = screen.getByRole("textbox");
  await waitFor(() => expect(requests.length).toBeGreaterThan(0));
  expect(JSON.stringify(requests)).toContain("exam_entered");
  state = { ...state, schedule_revision: 2, end_time: new Date(Date.now() + 120000).toISOString() };
  rerender(tree(true));
  expect(screen.getByRole("textbox")).toBe(input);
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ exam_status: "submitted" }), { status: 200 }));
  await act(async () => { await endExam("1"); });
  const count = append.mock.calls.length;
  await currentOwner!.emitter.emit({ eventType: "focus_lost", clientOccurredAtMs: 1000, payload: {} });
  expect(append).toHaveBeenCalledTimes(count);
  state = { ...state, exam_status: "submitted", session_identity: { ...state.session_identity, active_device_matches: false },
    integrity_upload: { upload_status: "pending", accept_until: new Date(Date.now() + 60000).toISOString(), final_seq: null,
      received_seq: 0, processed_seq: 0, commands_drained: false } };
  await act(async () => { rerender(tree(false)); });
  await waitFor(async () => {
    await currentOwner!.flush();
    expect(requests.some((body) => body.final_seq !== undefined)).toBe(true);
  }, { timeout: 5000 });
  expect(open).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Submitted")).toBeTruthy();
  uploadComplete = true;
  await act(async () => { await currentOwner!.flush(); });
  await waitFor(() => expect(screen.queryByTestId("integrity-upload-status")).toBeNull());
  state = { ...state, integrity_upload: { ...state.integrity_upload!, upload_status: "complete" } };
  await act(async () => { rerender(tree(false)); });
  expect(screen.queryByTestId("integrity-upload-status")).toBeNull();
  if (failure === "storage") expect(screen.getByTestId("integrity-local-data-loss")).toBeTruthy();
  else expect(screen.queryByTestId("integrity-local-data-loss")).toBeNull();
  // A reset mounts the answer child before the provider's passive effect has
  // replaced the completed owner. The first entry must belong to the NEW scope.
  const nextAttempt = crypto.randomUUID();
  uploadComplete = false;
  state = { ...state, exam_status: "in_progress", integrity_upload: null,
    session_identity: { ...state.session_identity, active_device_matches: true, attempt_id: nextAttempt, next_sequence: 1 } };
  await act(async () => { rerender(tree(true)); });
  await waitFor(async () => {
    await currentOwner!.flush();
    expect(requests.some((body) => {
      const scope = body.upload_scope as { attempt_id?: string } | undefined;
      const observations = body.observations as { records?: Array<{ event_type: string }> } | undefined;
      return scope?.attempt_id === nextAttempt && observations?.records?.some((record) => record.event_type === "exam_entered");
    })).toBe(true);
  }, { timeout: 5000 });
  unmount();
});
