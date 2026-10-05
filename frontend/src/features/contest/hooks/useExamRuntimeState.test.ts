import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mergeExamRuntimeState, useExamRuntimeState } from "./useExamRuntimeState";

const response = (revision: number, status = "in_progress") => new Response(JSON.stringify({
  server_now: "2024-01-01T00:00:00Z", start_time: "2023-12-31T23:00:00Z",
  end_time: "2024-01-01T01:00:00Z", schedule_revision: revision, exam_status: status,
  participant_id: 44, integrity_run: null,
  session_identity: { active_device_matches: false, device_id: null, attempt_id: null, next_sequence: null },
  integrity_upload: null,
}), { status: 200 });
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2024-01-01T00:20:00Z")); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("polls once per five seconds, keeps server offset, rejects older revisions and late same-revision status", async () => {
  let late!: (value: Response) => void;
  const fetcher = vi.fn().mockResolvedValueOnce(response(2))
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { late = resolve; }))
    .mockResolvedValueOnce(response(2, "submitted"))
    .mockResolvedValueOnce(response(1));
  vi.stubGlobal("fetch", fetcher);
  const { result, unmount } = renderHook(() => useExamRuntimeState("1"));
  await act(async () => {});
  expect(result.current.state?.serverOffsetMs).toBe(-1200000);
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  await act(async () => { window.dispatchEvent(new Event("online")); });
  expect(result.current.state?.exam_status).toBe("submitted");
  await act(async () => { late(response(2)); });
  expect(result.current.state?.exam_status).toBe("submitted");
  await act(async () => { await result.current.refresh(); });
  expect(result.current.state?.schedule_revision).toBe(2);
  expect(fetcher).toHaveBeenCalledTimes(4);
  unmount();
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(fetcher).toHaveBeenCalledTimes(4);
});


it("keeps successful admission authoritative across late same-revision reads and failed polling", async () => {
  let late!: (value: Response) => void;
  let replacement!: (value: Response) => void;
  const fetcher = vi.fn().mockResolvedValueOnce(response(2, "not_started"))
    .mockImplementationOnce(() => new Promise<Response>(resolve => { late = resolve; }))
    .mockImplementationOnce(() => new Promise<Response>(resolve => { replacement = resolve; }))
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(new Response(JSON.stringify({ server_now: "invalid", schedule_revision: 2 })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ server_now: "2024-01-01T00:00:00Z", schedule_revision: 2, exam_status: "unknown" })))
    .mockResolvedValueOnce(response(1, "not_started"))
    .mockResolvedValueOnce(response(2, "paused"));
  vi.stubGlobal("fetch", fetcher);
  const { result } = renderHook(() => useExamRuntimeState("1"));
  await act(async () => {});
  await act(async () => { void result.current.refresh(); });
  await act(async () => {
    window.dispatchEvent(new CustomEvent("qjudge:exam-started", { detail: { contestId: "other" } }));
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  await act(async () => {
    window.dispatchEvent(new CustomEvent("qjudge:exam-started", { detail: { contestId: "1" } }));
  });
  const contest = { id: "1", examStatus: "not_started" } as Parameters<typeof mergeExamRuntimeState>[0];
  const status = () => mergeExamRuntimeState(contest, result.current.state, result.current.confirmedStatus)?.examStatus;
  expect(status()).toBe("in_progress");
  expect(result.current.state).toBeNull(); // Previous attempt identity/grants cannot be reused.
  await act(async () => { late(response(2, "not_started")); });
  expect(status()).toBe("in_progress");
  // Five-second polling supersedes the admission read, then fails.
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  await act(async () => { replacement(response(2, "not_started")); });
  expect(status()).toBe("in_progress");
  await act(async () => { await result.current.refresh(); });
  expect(status()).toBe("in_progress");
  await act(async () => { await result.current.refresh(); });
  expect(status()).toBe("in_progress");
  // A lower schedule revision cannot discard confirmed admission.
  await act(async () => { await result.current.refresh(); });
  expect(status()).toBe("in_progress");
  // A subsequent fresh valid response can pause/lock/reset normally.
  await act(async () => { await result.current.refresh(); });
  expect(status()).toBe("paused");
  expect(result.current.confirmedStatus).toBeNull();
});


it("replaces pending admission with successful submission even while polling remains offline", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(2, "not_started")).mockRejectedValue(new Error("offline")));
  const { result, rerender } = renderHook(({id}) => useExamRuntimeState(id), {initialProps: {id: "1"}});
  await act(async () => {});
  await act(async () => { window.dispatchEvent(new CustomEvent("qjudge:exam-started", {detail: {contestId: "1"}})); });
  expect(result.current.confirmedStatus).toBe("in_progress");
  await act(async () => { window.dispatchEvent(new CustomEvent("qjudge:exam-submitted", {detail: {contestId: "1"}})); });
  expect(result.current.confirmedStatus).toBe("submitted");
  expect(result.current.state).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(result.current.confirmedStatus).toBe("submitted");
  await act(async () => { rerender({id: "2"}); });
  expect(result.current.confirmedStatus).toBeNull();
});
