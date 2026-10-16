import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ServiceStatusScreen from "./ServiceStatusScreen";
import { getServiceStatus } from "@/infrastructure/api/repositories/serviceStatus.repository";
import type {
  ContainerStatus,
  ServiceStatusReport,
} from "@/core/entities/serviceStatus.entity";

const interpolate = (text: string, values?: unknown) =>
  text.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    String((values as Record<string, unknown> | undefined)?.[name] ?? ""),
  );
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown, values?: unknown) =>
      typeof fallback === "string" ? interpolate(fallback, values) : key,
  }),
}));

vi.mock("@/infrastructure/api/repositories/serviceStatus.repository", () => ({
  getServiceStatus: vi.fn(),
}));

const report = (overrides: Partial<ServiceStatusReport> = {}): ServiceStatusReport => ({
  generatedAt: "2026-09-10T08:00:00Z",
  components: [
    { id: "database", status: "up", detail: "online_judge", latencyMs: 3 },
    { id: "celery", status: "up", detail: "2 worker(s)", latencyMs: 2125 },
  ],
  integrity: {
    liveRunCount: 2,
    unhealthyRunCount: 0,
    staleHeartbeatCount: 0,
    neverReportedCount: 0,
    heartbeatStaleAfterSeconds: 120,
    unhealthyRuns: [],
  },
  containers: { agent: "ok", items: [] },
  ...overrides,
});

const container = (overrides: Partial<ContainerStatus> = {}): ContainerStatus => ({
  project: "qjudge",
  service: "backend",
  state: "running",
  health: "healthy",
  ...overrides,
});

describe("ServiceStatusScreen", () => {
  beforeEach(() => {
    vi.mocked(getServiceStatus).mockReset();
  });

  it("probes once on open rather than polling", async () => {
    vi.mocked(getServiceStatus).mockResolvedValue(report());

    render(<ServiceStatusScreen />);

    await waitFor(() => expect(screen.getByTestId("service-components")).toBeTruthy());
    expect(getServiceStatus).toHaveBeenCalledTimes(1);
  });

  it("summarises everything as up when no component is down", async () => {
    vi.mocked(getServiceStatus).mockResolvedValue(report());

    render(<ServiceStatusScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("service-summary").textContent).toContain("全部服務正常"),
    );
  });

  it("counts the components that are down", async () => {
    vi.mocked(getServiceStatus).mockResolvedValue(
      report({
        components: [
          { id: "database", status: "up", detail: "ok", latencyMs: 3 },
          { id: "ai_service", status: "down", detail: "OSError: refused", latencyMs: 2000 },
          { id: "celery", status: "down", detail: "no worker replied", latencyMs: 2000 },
        ],
      }),
    );

    render(<ServiceStatusScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("service-summary").textContent).toContain("2 項服務異常"),
    );
    // The raw probe error is the point of this panel: an operator can act on it.
    expect(screen.getByText("OSError: refused")).toBeTruthy();
  });

  it("surfaces unhealthy integrity runs with their worker error", async () => {
    vi.mocked(getServiceStatus).mockResolvedValue(
      report({
        integrity: {
          liveRunCount: 1,
          unhealthyRunCount: 1,
          staleHeartbeatCount: 1,
          neverReportedCount: 0,
          heartbeatStaleAfterSeconds: 120,
          unhealthyRuns: [
            {
              id: "run-1",
              contestId: "contest-1",
              sessionState: "active",
              dataState: "open",
              lastError: "resident_archive_verification_failed",
              workerVersion: "v1",
              lastWorkerHeartbeatAt: null,
              updatedAt: "2026-09-10T07:59:00Z",
            },
          ],
        },
      }),
    );

    render(<ServiceStatusScreen />);

    await waitFor(() => expect(screen.getByTestId("unhealthy-runs")).toBeTruthy());
    expect(screen.getByText("resident_archive_verification_failed")).toBeTruthy();
    expect(screen.getByText("無心跳")).toBeTruthy();
  });

  it("reports a failed load instead of rendering a blank panel", async () => {
    vi.mocked(getServiceStatus).mockRejectedValue(new Error("503 Service Unavailable"));

    render(<ServiceStatusScreen />);

    await waitFor(() =>
      expect(screen.getByText("無法讀取服務狀態")).toBeTruthy(),
    );
    expect(screen.getByText("503 Service Unavailable")).toBeTruthy();
    // No report means nothing to vouch for: never show "all services up" over an error.
    expect(screen.queryByText("全部服務正常")).toBeNull();
  });

  it("re-probes on demand", async () => {
    vi.mocked(getServiceStatus).mockResolvedValue(report());
    render(<ServiceStatusScreen />);
    await waitFor(() => expect(getServiceStatus).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole("button", { name: /重新探測/ }));

    await waitFor(() => expect(getServiceStatus).toHaveBeenCalledTimes(2));
  });

  it("counts a stopped container as down", async () => {
    vi.mocked(getServiceStatus).mockResolvedValue(
      report({
        containers: {
          agent: "ok",
          items: [
            container(),
            container({ project: "qjudge-storage", service: "minio", state: "exited", health: "" }),
          ],
        },
      }),
    );

    render(<ServiceStatusScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("service-summary").textContent).toContain("1 項服務異常"),
    );
    expect(screen.getByTestId("container-qjudge-storage-minio").textContent).toContain("exited");
  });

  it("adds abnormal containers to the failed probes", async () => {
    vi.mocked(getServiceStatus).mockResolvedValue(
      report({
        components: [
          { id: "database", status: "up", detail: "ok", latencyMs: 3 },
          { id: "celery", status: "down", detail: "no worker replied", latencyMs: 2000 },
        ],
        containers: {
          agent: "ok",
          items: [container({ state: "restarting", health: "" })],
        },
      }),
    );

    render(<ServiceStatusScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("service-summary").textContent).toContain("2 項服務異常"),
    );
  });

  it("treats a running container as healthy unless its health check says otherwise", async () => {
    vi.mocked(getServiceStatus).mockResolvedValue(
      report({
        containers: {
          agent: "ok",
          items: [
            container({ service: "backend", health: "healthy" }),
            container({ service: "nginx", health: "" }),
            container({ service: "worker", health: "unhealthy" }),
            container({ service: "slow", health: "starting" }),
          ],
        },
      }),
    );

    render(<ServiceStatusScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("service-summary").textContent).toContain("2 項服務異常"),
    );
    expect(screen.getByTestId("container-qjudge-worker").textContent).toContain("unhealthy");
    expect(screen.getByTestId("container-qjudge-slow").textContent).toContain("starting");
  });

  it("groups containers under their compose project", async () => {
    vi.mocked(getServiceStatus).mockResolvedValue(
      report({
        containers: {
          agent: "ok",
          items: [
            container({ project: "qjudge", service: "backend" }),
            container({ project: "qjudge-storage", service: "minio" }),
            container({ project: "qjudge", service: "frontend" }),
          ],
        },
      }),
    );

    render(<ServiceStatusScreen />);

    const group = await screen.findByTestId("container-group-qjudge");
    expect(group.textContent).toContain("backend");
    expect(group.textContent).toContain("frontend");
    expect(group.textContent).not.toContain("minio");
    expect(screen.getByTestId("container-group-qjudge-storage").textContent).toContain("minio");
  });

  it("explains missing containers without hiding probes", async () => {
    vi.mocked(getServiceStatus).mockResolvedValue(
      report({ containers: { agent: "unsupported", items: [] } }),
    );

    render(<ServiceStatusScreen />);

    await waitFor(() =>
      expect(screen.getByText("此環境沒有主機 agent，無法顯示容器狀態")).toBeTruthy(),
    );
    expect(screen.getByTestId("service-components")).toBeTruthy();
    expect(screen.getByTestId("service-summary").textContent).toContain("全部服務正常");
  });

  it("says when the host agent cannot be reached", async () => {
    vi.mocked(getServiceStatus).mockResolvedValue(
      report({ containers: { agent: "unreachable", items: [] } }),
    );

    render(<ServiceStatusScreen />);

    await waitFor(() => expect(screen.getByText("無法連線到主機 agent")).toBeTruthy());
    expect(screen.getByTestId("service-components")).toBeTruthy();
  });

  it("says so when the agent answers with no containers", async () => {
    vi.mocked(getServiceStatus).mockResolvedValue(report());

    render(<ServiceStatusScreen />);

    await waitFor(() => expect(screen.getByText("主機 agent 沒有回報任何容器")).toBeTruthy());
  });
});
