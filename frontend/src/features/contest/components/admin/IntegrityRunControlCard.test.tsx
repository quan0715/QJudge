import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ExamIntegrityRun } from "@/core/entities/examIntegrity.entity";
import { ToastProvider } from "@/shared/contexts/ToastContext";

import {
  IntegrityRunControlCard,
  type IntegrityRunControlCardProps,
} from "./IntegrityRunControlCard";

type Repository = NonNullable<IntegrityRunControlCardProps["repository"]>;

const run: ExamIntegrityRun = {
  id: "run-1", computeState: "running", health: "healthy", dataState: "open",
  warnings: [], metrics: {}, lastError: "", lastCorrelationId: "", registryVersion: "v1",
  workerImage: "worker", workerImageDigest: "", workerVersion: "v1",
  lastWorkerHeartbeatAt: null, scheduledStartAt: null, scheduledEndAt: null,
  startedAt: null, stoppedAt: null, destroyedAt: null, purgedAt: null,
  retentionUntil: null, archiveGeneration: 0, receivedCounts: {}, processedCounts: {}, archivedCounts: {},
};

const renderCard = (
  currentRun: ExamIntegrityRun | null,
  restartRun = vi.fn(async () => ({ ...run, health: "healthy" as const })),
) => {
  const repository: Repository = {
    listRuns: vi.fn(async () => currentRun ? [currentRun] : []),
    restartRun,
  };

  render(
    <ToastProvider>
      <IntegrityRunControlCard contestId="contest" repository={repository} />
    </ToastProvider>,
  );

  return { repository, restartRun };
};

describe("IntegrityRunControlCard", () => {
  it("shows healthy lifecycle as system-managed with no manual actions", async () => {
    renderCard(run);

    expect(await screen.findByText("正常運作")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/停止|銷毀|清除|建立 Run/)).not.toBeInTheDocument();
  });

  it("shows no action while the system has not created a run", async () => {
    renderCard(null);

    expect(await screen.findByText("等待系統啟動")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers restart only for an unhealthy running Worker", async () => {
    renderCard({ ...run, health: "unhealthy", lastError: "worker_unavailable" });

    expect(await screen.findByText("Worker 異常")).toBeVisible();
    expect(screen.getByRole("button", { name: "重新啟動 Worker" })).toBeEnabled();
    expect(screen.queryByText("worker_unavailable")).not.toBeInTheDocument();
  });

  it("uses one inline confirmation and preserves run data", async () => {
    const restartRun = vi.fn(async () => ({ ...run, health: "healthy" as const }));
    renderCard({ ...run, health: "unhealthy" }, restartRun);

    fireEvent.click(await screen.findByRole("button", { name: "重新啟動 Worker" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("事件與證據資料會保留。" )).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "確認重啟" }));
    await waitFor(() => expect(restartRun).toHaveBeenCalledWith("contest", "run-1"));
  });
});
