import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ClassroomDetail,
  ClassroomGradebook,
} from "@/core/entities/classroom.entity";
import {
  exportClassroomGradebook,
  getClassroomGradebook,
} from "@/infrastructure/api/repositories/classroom.repository";
import { GradebookPanel } from "./GradebookPanel";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      key: string,
      fallbackOrParams?: string | Record<string, unknown>,
      maybeParams?: Record<string, unknown>,
    ) => {
      const fallback =
        typeof fallbackOrParams === "string" ? fallbackOrParams : key;
      const params =
        typeof fallbackOrParams === "string" ? maybeParams : fallbackOrParams;
      if (!params) return fallback;
      return Object.entries(params).reduce(
        (acc, [paramKey, value]) =>
          acc.replace(`{{${paramKey}}}`, String(value)),
        fallback,
      );
    },
  }),
  initReactI18next: {
    type: "3rdParty",
    init: () => {},
  },
}));

vi.mock("@/infrastructure/api/repositories/classroom.repository");

const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock("@/shared/contexts/ToastContext", () => ({
  useToast: () => toast,
}));

const classroom = { id: "classroom-1" } as ClassroomDetail;

const gradebook: ClassroomGradebook = {
  contests: [
    {
      id: "contest-lab",
      name: "Lab 1",
      contestType: "coding",
      startTime: "2026-09-15T02:00:00.000Z",
      maxScore: 300,
    },
  ],
  students: [
    {
      userId: 1,
      username: "110550001",
      displayName: "王小明",
      scores: { "contest-lab": 300 },
    },
  ],
};

describe("GradebookPanel", () => {
  beforeEach(() => {
    vi.mocked(getClassroomGradebook).mockReset();
    vi.mocked(exportClassroomGradebook).mockReset();
    toast.showToast.mockReset();
  });

  it("loads gradebook for the classroom", async () => {
    vi.mocked(getClassroomGradebook).mockResolvedValue(gradebook);

    render(<GradebookPanel classroom={classroom} />);

    expect(await screen.findByText("Lab 1")).toBeInTheDocument();
    expect(getClassroomGradebook).toHaveBeenCalledWith("classroom-1");
  });

  it("shows load error", async () => {
    vi.mocked(getClassroomGradebook).mockRejectedValue(new Error("boom"));

    render(<GradebookPanel classroom={classroom} />);

    expect(await screen.findByText("無法載入成績總表")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "匯出 CSV" })).toBeNull();
  });

  it("exports the gradebook of the classroom", async () => {
    vi.mocked(getClassroomGradebook).mockResolvedValue(gradebook);
    vi.mocked(exportClassroomGradebook).mockResolvedValue(undefined);

    render(<GradebookPanel classroom={classroom} />);
    fireEvent.click(await screen.findByRole("button", { name: "匯出 CSV" }));

    await waitFor(() =>
      expect(exportClassroomGradebook).toHaveBeenCalledWith("classroom-1"),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "匯出 CSV" })).toBeEnabled(),
    );
    expect(toast.showToast).not.toHaveBeenCalled();
  });

  it("keeps export disabled until the download settles", async () => {
    vi.mocked(getClassroomGradebook).mockResolvedValue(gradebook);
    let finishExport: () => void = () => {};
    vi.mocked(exportClassroomGradebook).mockReturnValue(
      new Promise<void>((resolve) => {
        finishExport = resolve;
      }),
    );

    render(<GradebookPanel classroom={classroom} />);
    fireEvent.click(await screen.findByRole("button", { name: "匯出 CSV" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "匯出 CSV" })).toBeDisabled(),
    );

    finishExport();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "匯出 CSV" })).toBeEnabled(),
    );
  });

  it("toasts on export failure", async () => {
    vi.mocked(getClassroomGradebook).mockResolvedValue(gradebook);
    vi.mocked(exportClassroomGradebook).mockRejectedValue(new Error("boom"));

    render(<GradebookPanel classroom={classroom} />);
    fireEvent.click(await screen.findByRole("button", { name: "匯出 CSV" }));

    await waitFor(() =>
      expect(toast.showToast).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "error", title: "匯出失敗" }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "匯出 CSV" })).toBeEnabled(),
    );
  });
});
