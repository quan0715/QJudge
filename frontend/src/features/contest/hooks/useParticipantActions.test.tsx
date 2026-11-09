import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  showToast: vi.fn(),
  unlockParticipant: vi.fn(),
  reopenExam: vi.fn(),
  resetParticipantExamRecord: vi.fn(),
  updateParticipant: vi.fn(),
  downloadParticipantReport: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
vi.mock("@/shared/ui/modal", () => ({
  useConfirmModal: () => ({ confirm: mocks.confirm, modalProps: { open: false } }),
}));
vi.mock("@/shared/contexts/ToastContext", () => ({ useToast: () => ({ showToast: mocks.showToast }) }));
vi.mock("@/infrastructure/api/repositories", () => ({
  unlockParticipant: mocks.unlockParticipant,
  reopenExam: mocks.reopenExam,
  resetParticipantExamRecord: mocks.resetParticipantExamRecord,
  updateParticipant: mocks.updateParticipant,
  downloadParticipantReport: mocks.downloadParticipantReport,
}));

import { useParticipantActions } from "./useParticipantActions";

const onChanged = vi.fn().mockResolvedValue(undefined);
const setup = () => renderHook(() => useParticipantActions({ contestId: "c1", userId: "7", classroomId: "r1", onChanged })).result;

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.confirm.mockResolvedValue(true);
  onChanged.mockClear();
});

describe("useParticipantActions", () => {
  it("unlock asks for confirmation, calls the API, then refreshes", async () => {
    const result = setup();
    await act(() => result.current.unlock());
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: "確定要解除此學生的鎖定嗎？" }));
    expect(mocks.unlockParticipant).toHaveBeenCalledWith("c1", 7);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(mocks.showToast).toHaveBeenCalledWith(expect.objectContaining({ kind: "success", subtitle: "已解除鎖定" }));
  });

  it("unlock does nothing when confirmation is cancelled", async () => {
    mocks.confirm.mockResolvedValue(false);
    const result = setup();
    await act(() => result.current.unlock());
    expect(mocks.unlockParticipant).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("lock trims the reason and sends locked status without a confirmation", async () => {
    const result = setup();
    await act(() => result.current.lock("  離開座位 "));
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.updateParticipant).toHaveBeenCalledWith("c1", 7, { exam_status: "locked", lock_reason: "離開座位" });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("updateStatus only sends a lock reason for locked", async () => {
    const result = setup();
    await act(() => result.current.updateStatus("in_progress", "ignored"));
    expect(mocks.updateParticipant).toHaveBeenCalledWith("c1", 7, { exam_status: "in_progress", lock_reason: "" });
  });

  it("reset asks for confirmation and passes the user id string", async () => {
    const result = setup();
    await act(() => result.current.resetExamRecord());
    expect(mocks.resetParticipantExamRecord).toHaveBeenCalledWith("c1", "7");
  });

  it("assisted attendance returns to the participants panel with the user selected", () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    const result = setup();
    result.current.startAssistedAttendance("check_in");
    const target = new URL(assign.mock.calls[0][0], "http://x");
    expect(target.pathname).toBe("/classrooms/r1/contest/c1/attendance/scan");
    expect(target.searchParams.get("purpose")).toBe("check_in");
    expect(target.searchParams.get("returnTo")).toBe("/classrooms/r1/contest/c1/admin?panel=participants&user=7");
    vi.unstubAllGlobals();
  });

  it("reports whether an action succeeded", async () => {
    const result = setup();
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.lock("x"); });
    expect(ok).toBe(true);
    mocks.updateParticipant.mockRejectedValue(new Error("nope"));
    await act(async () => { ok = await result.current.lock("x"); });
    expect(ok).toBe(false);
  });

  it("shows an error toast with the API message when an action fails", async () => {
    mocks.reopenExam.mockRejectedValue(new Error("boom"));
    const result = setup();
    await act(() => result.current.reopen());
    expect(onChanged).not.toHaveBeenCalled();
    expect(mocks.showToast).toHaveBeenCalledWith(expect.objectContaining({ kind: "error", subtitle: "boom" }));
  });
});
