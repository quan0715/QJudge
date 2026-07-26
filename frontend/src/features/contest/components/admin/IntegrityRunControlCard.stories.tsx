import type { Meta, StoryObj } from "@storybook/react-vite";

import type { ExamIntegrityRun } from "@/core/entities/examIntegrity.entity";
import { ToastProvider } from "@/shared/contexts/ToastContext";

import { IntegrityRunControlCard } from "./IntegrityRunControlCard";

const makeRun = (overrides: Partial<ExamIntegrityRun> = {}): ExamIntegrityRun => ({
  id: "run-1", computeState: "running", health: "healthy", dataState: "open",
  warnings: [], metrics: {}, lastError: "", lastCorrelationId: "", registryVersion: "2026-07-21.3",
  workerImage: "integrity-worker", workerImageDigest: "sha256:demo", workerVersion: "1.0.0",
  lastWorkerHeartbeatAt: new Date().toISOString(), scheduledStartAt: null, scheduledEndAt: null,
  startedAt: new Date().toISOString(), stoppedAt: null, destroyedAt: null, purgedAt: null,
  retentionUntil: null, archiveGeneration: 1, receivedCounts: { batches: 42 }, processedCounts: {}, archivedCounts: {},
  ...overrides,
});

const meta = {
  title: "features/contest/admin/IntegrityRunControlCard",
  component: IntegrityRunControlCard,
  decorators: [(Story) => <ToastProvider><Story /></ToastProvider>],
  args: {
    contestId: "contest-1",
    repository: {
      listRuns: async () => [makeRun()],
      restartRun: async () => makeRun(),
    },
  },
} satisfies Meta<typeof IntegrityRunControlCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
export const NoRun: Story = { args: { repository: { ...meta.args.repository!, listRuns: async () => [] } } };
export const WorkerUnhealthy: Story = { args: { repository: { ...meta.args.repository!, listRuns: async () => [makeRun({ health: "unhealthy" })] } } };
export const ArchivedAfterDestroy: Story = { args: { repository: { ...meta.args.repository!, listRuns: async () => [makeRun({ computeState: "destroyed", dataState: "archived" })] } } };
