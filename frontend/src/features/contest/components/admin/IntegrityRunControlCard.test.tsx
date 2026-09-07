import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ExamIntegrityRun } from "@/core/entities/examIntegrity.entity";
import { ToastProvider } from "@/shared/contexts/ToastContext";

import {
  IntegrityRunControlCard,
  type IntegrityRunControlCardProps,
} from "./IntegrityRunControlCard";

type Repository = NonNullable<IntegrityRunControlCardProps["repository"]>;

const run: ExamIntegrityRun = {
  id: "run-1", sessionState: "active", health: "healthy", dataState: "open",
  warnings: [], metrics: {}, lastError: "", lastCorrelationId: "", registryVersion: "v1",
  workerVersion: "v1",
  lastWorkerHeartbeatAt: null, scheduledStartAt: null, scheduledEndAt: null,
  purgedAt: null,
  retentionUntil: null, archiveGeneration: 0, receivedCounts: {}, processedCounts: {}, archivedCounts: {},
};

const renderCard = (
  currentRun: ExamIntegrityRun | null,
) => {
  const repository: Repository = {
    listRuns: vi.fn(async () => currentRun ? [currentRun] : []),
  };

  render(
    <ToastProvider>
      <IntegrityRunControlCard contestId="contest" repository={repository} />
    </ToastProvider>,
  );

  return { repository };
};

describe("IntegrityRunControlCard", () => {
  it("shows healthy lifecycle as system-managed with no manual actions", async () => {
    renderCard(run);

    expect(await screen.findByText("監考中")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/停止|銷毀|清除|建立 Run/)).not.toBeInTheDocument();
  });

  it("shows no action while the system has not created a run", async () => {
    renderCard(null);

    expect(await screen.findByText("等待考試開始")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows interruption without exposing service controls", async () => {
    renderCard({ ...run, health: "unhealthy", lastError: "worker_unavailable" });

    expect(await screen.findByText("監考暫時中斷")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText("worker_unavailable")).not.toBeInTheDocument();
  });

  it.each([
    ["draining", "open", "整理考試紀錄中"],
    ["archived", "archived", "已封存"],
    ["closed", "purged", "資料已清除"],
  ] as const)("shows %s without manual controls", async (sessionState, dataState, label) => {
    renderCard({ ...run, sessionState, dataState });
    expect(await screen.findByText(label)).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows an unavailable state when polling fails", async () => {
    render(<IntegrityRunControlCard contestId="contest" repository={{
      listRuns: vi.fn().mockRejectedValue(new Error("offline")),
    }} />);
    expect(await screen.findByText("暫時無法更新監考狀態")).toBeVisible();
    expect(screen.queryByText("監考中")).not.toBeInTheDocument();
  });
});
