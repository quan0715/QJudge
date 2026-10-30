import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCaptureMonitoring } from "./useCaptureMonitoring";

const options = (source: "screen_share" | "webcam") => ({
  source, enabled: true, examSubmitted: false, monitoringDisabled: false,
  streamActive: false, moduleRole: "primary", emitter: { emit: vi.fn().mockResolvedValue(undefined) },
});

describe.each(["screen_share", "webcam"] as const)("%s monitoring", (source) => {
  it("records loss and restoration without deciding a penalty", () => {
    const props = options(source);
    const { result } = renderHook(() => useCaptureMonitoring(props));
    act(() => result.current.onStreamLost());
    expect(result.current.interrupted).toBe(true);
    expect(props.emitter.emit).toHaveBeenLastCalledWith({
      eventType: `${source}_interrupted`, clientOccurredAtMs: expect.any(Number),
      payload: { reason: "stream_ended", module: source, module_role: "primary" },
    });
    act(() => result.current.onStreamRestored());
    expect(result.current.interrupted).toBe(false);
    expect(props.emitter.emit).toHaveBeenLastCalledWith({
      eventType: `${source}_restored`, clientOccurredAtMs: expect.any(Number),
      payload: { reason: source === "screen_share" ? "user_reshared" : "stream_recovered", module: source, module_role: "primary" },
    });
  });
  it.each(["disabled", "submitted"])("ignores stream loss when %s", (state) => {
    const props = { ...options(source), enabled: state !== "disabled", examSubmitted: state === "submitted" };
    const { result } = renderHook(() => useCaptureMonitoring(props));
    act(() => result.current.onStreamLost());
    expect(props.emitter.emit).not.toHaveBeenCalled();
    expect(result.current.interrupted).toBe(false);
  });
  it("uses the latest emitter and module role", () => {
    const first = options(source);
    const { result, rerender } = renderHook(props => useCaptureMonitoring(props), { initialProps: first });
    const next = { ...options(source), moduleRole: "secondary" };
    rerender(next);
    act(() => result.current.onStreamLost());
    expect(first.emitter.emit).not.toHaveBeenCalled();
    expect(next.emitter.emit).toHaveBeenCalledWith(expect.objectContaining({
      payload: { reason: "stream_ended", module: source, module_role: "secondary" },
    }));
  });
  it("clears UI state on submission without emitting restoration", () => {
    const props = options(source);
    const { result, rerender } = renderHook(p => useCaptureMonitoring(p), { initialProps: props });
    act(() => result.current.onStreamLost());
    rerender({ ...props, examSubmitted: true });
    expect(result.current.interrupted).toBe(false);
    expect(props.emitter.emit).toHaveBeenCalledTimes(1);
  });
});
it("keeps screen-share interruption until monitoring is disabled or restored", () => {
  const props = options("screen_share");
  const { result, rerender } = renderHook(p => useCaptureMonitoring(p), { initialProps: props });
  act(() => result.current.onStreamLost());
  rerender({ ...props, enabled: false });
  expect(result.current.interrupted).toBe(true);
  rerender({ ...props, monitoringDisabled: true });
  expect(result.current.interrupted).toBe(false);
  expect(props.emitter.emit).toHaveBeenCalledTimes(1);
});
it("automatically records webcam recovery when the stream returns", () => {
  const props = options("webcam");
  const { result, rerender } = renderHook(p => useCaptureMonitoring(p), { initialProps: props });
  act(() => result.current.onStreamLost());
  rerender({ ...props, streamActive: true });
  expect(result.current.interrupted).toBe(false);
  expect(props.emitter.emit).toHaveBeenLastCalledWith(expect.objectContaining({ eventType: "webcam_restored" }));
});
it("clears webcam interruption when webcam monitoring is disabled", () => {
  const props = options("webcam");
  const { result, rerender } = renderHook(p => useCaptureMonitoring(p), { initialProps: props });
  act(() => result.current.onStreamLost());
  rerender({ ...props, enabled: false });
  expect(result.current.interrupted).toBe(false);
  expect(props.emitter.emit).toHaveBeenCalledTimes(1);
});
