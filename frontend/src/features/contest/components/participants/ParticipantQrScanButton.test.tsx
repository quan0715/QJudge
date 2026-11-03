import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContestParticipant } from "@/core/entities/contest.entity";

const mocks = vi.hoisted(() => ({
  onDetected: null as null | ((raw: string) => void),
  showToast: vi.fn(),
  parse: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }),
}));
vi.mock("@/shared/contexts/ToastContext", () => ({ useToast: () => ({ showToast: mocks.showToast }) }));
vi.mock("@/features/contest/screens/attendance/hooks/useCameraStream", () => ({
  useCameraStream: () => ({ videoRef: { current: null }, setVideoElement: vi.fn(), cameraState: "ready", cameraError: "" }),
}));
vi.mock("@/features/contest/screens/attendance/hooks/useQrScanner", () => ({
  useQrScanner: ({ onDetected }: { onDetected: (raw: string) => void }) => {
    mocks.onDetected = onDetected;
    return "waiting";
  },
}));
vi.mock("@/features/contest/attendance/attendanceQr", () => ({ parseStudentLocatorQrValue: mocks.parse }));

import ParticipantQrScanButton from "./ParticipantQrScanButton";

const participants = [{ userId: "7", username: "s7" } as ContestParticipant];

beforeEach(() => {
  mocks.showToast.mockClear();
  mocks.parse.mockReset();
});

const open = (onSelect = vi.fn()) => {
  render(<ParticipantQrScanButton contestId="c1" participants={participants} onSelect={onSelect} />);
  fireEvent.click(screen.getByRole("button", { name: "掃描學生 QR" }));
  return onSelect;
};

describe("ParticipantQrScanButton", () => {
  it("selects the participant for a valid code of this contest", () => {
    mocks.parse.mockReturnValue({ contestId: "c1", userId: "7" });
    const onSelect = open();
    act(() => mocks.onDetected?.("qr"));
    expect(onSelect).toHaveBeenCalledWith("7");
  });

  it("rejects a code from another contest", () => {
    mocks.parse.mockReturnValue({ contestId: "other", userId: "7" });
    const onSelect = open();
    act(() => mocks.onDetected?.("qr"));
    expect(onSelect).not.toHaveBeenCalled();
    expect(mocks.showToast).toHaveBeenCalledWith(expect.objectContaining({ subtitle: "這不是本場考試的考生 QR。" }));
  });

  it("rejects an unknown participant", () => {
    mocks.parse.mockReturnValue({ contestId: "c1", userId: "99" });
    const onSelect = open();
    act(() => mocks.onDetected?.("qr"));
    expect(onSelect).not.toHaveBeenCalled();
    expect(mocks.showToast).toHaveBeenCalledWith(expect.objectContaining({ subtitle: "找不到對應的考生。" }));
  });
});
