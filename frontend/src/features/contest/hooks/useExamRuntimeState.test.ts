import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useExamRuntimeState } from "./useExamRuntimeState";

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
