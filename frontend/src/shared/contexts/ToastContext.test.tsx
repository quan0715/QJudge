import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./ToastContext";

const Trigger = ({ onAction }: { onAction: () => void }) => {
  const { showToast } = useToast();
  return (
    <button type="button" onClick={() => showToast({ kind: "success", title: "B 題判完：AC", timeout: 8000, action: { label: "查看", onClick: onAction } })}>
      show
    </button>
  );
};

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

it("runs an action toast's action and closes it", () => {
  const onAction = vi.fn();
  render(<ToastProvider><Trigger onAction={onAction} /></ToastProvider>);
  fireEvent.click(screen.getByText("show"));
  fireEvent.click(screen.getByRole("button", { name: "查看" }));
  expect(onAction).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("B 題判完：AC")).not.toBeInTheDocument();
});

it("closes an action toast after its timeout", () => {
  render(<ToastProvider><Trigger onAction={vi.fn()} /></ToastProvider>);
  fireEvent.click(screen.getByText("show"));
  act(() => { vi.advanceTimersByTime(7999); });
  expect(screen.getByText("B 題判完：AC")).toBeInTheDocument();
  act(() => { vi.advanceTimersByTime(1); });
  expect(screen.queryByText("B 題判完：AC")).not.toBeInTheDocument();
});
