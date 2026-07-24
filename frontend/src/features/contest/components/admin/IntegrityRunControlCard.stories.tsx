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
    contestId: "contest-1", contestName: "2026 Midterm", contestStartAt: new Date(Date.now() + 30_000).toISOString(),
    repository: {
      listRuns: async () => [makeRun()], getRun: async () => makeRun(), createRun: async () => makeRun({ computeState: "stopped" }),
      startRun: async () => makeRun(), stopRun: async () => makeRun({ computeState: "stopped", dataState: "archived" }),
      destroyRun: async () => makeRun({ computeState: "destroyed", dataState: "archived" }), purgeRun: async () => makeRun({ computeState: "destroyed", dataState: "purged" }),
    },
  },
} satisfies Meta<typeof IntegrityRunControlCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
export const NoRun: Story = { args: { repository: { ...meta.args.repository!, listRuns: async () => [] } } };
export const WarningAndArchiveLag: Story = { args: { repository: { ...meta.args.repository!, listRuns: async () => [makeRun({ health: "unhealthy", warnings: ["archive_lag"] })] } } };
export const DestroyedRetained: Story = { args: { repository: { ...meta.args.repository!, listRuns: async () => [makeRun({ computeState: "destroyed", dataState: "archived" })] } } };
