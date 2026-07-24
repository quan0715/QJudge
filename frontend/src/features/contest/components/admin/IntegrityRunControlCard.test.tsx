import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ExamIntegrityRun } from "@/core/entities/examIntegrity.entity";
import { ToastProvider } from "@/shared/contexts/ToastContext";

import { IntegrityRunControlCard } from "./IntegrityRunControlCard";

const run: ExamIntegrityRun = {
  id: "run-1", computeState: "running", health: "unhealthy", dataState: "open", warnings: ["archive_lag"], metrics: {}, lastError: "", lastCorrelationId: "", registryVersion: "v1", workerImage: "worker", workerImageDigest: "", workerVersion: "v1", lastWorkerHeartbeatAt: null, scheduledStartAt: null, scheduledEndAt: null, startedAt: null, stoppedAt: null, destroyedAt: null, purgedAt: null, retentionUntil: null, archiveGeneration: 0, receivedCounts: {}, processedCounts: {}, archivedCounts: {},
};

describe("IntegrityRunControlCard", () => {
  it("shows the independent run-state dimensions", async () => {
    render(<ToastProvider><IntegrityRunControlCard contestId="contest" contestName="Midterm" repository={{ listRuns: async () => [run], getRun: async () => run, createRun: async () => run, startRun: async () => run, stopRun: async () => run, destroyRun: async () => run, purgeRun: async () => run }} /></ToastProvider>);
    expect(await screen.findByText(/running\/unhealthy\/open/)).toBeVisible();
    expect(screen.getByText("archive_lag")).toBeVisible();
    expect(screen.getByRole("button", { name: "停止並封存" })).toBeEnabled();
  });
});
