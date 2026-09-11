import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ServiceStatusScreen from "./ServiceStatusScreen";
import { getServiceStatus } from "@/infrastructure/api/repositories/serviceStatus.repository";
import type { ServiceStatusReport } from "@/core/entities/serviceStatus.entity";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) =>
      typeof fallback === "string" ? fallback : key,
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
      expect(screen.getByTestId("service-summary").textContent).toContain("2"),
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
  });

  it("re-probes on demand", async () => {
    vi.mocked(getServiceStatus).mockResolvedValue(report());
    render(<ServiceStatusScreen />);
    await waitFor(() => expect(getServiceStatus).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole("button", { name: /重新探測/ }));

    await waitFor(() => expect(getServiceStatus).toHaveBeenCalledTimes(2));
  });
});
