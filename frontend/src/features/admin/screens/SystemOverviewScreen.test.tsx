import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SystemOverviewScreen from "./SystemOverviewScreen";
import { getServiceStatus } from "@/infrastructure/api/repositories/serviceStatus.repository";
import { searchUsers } from "@/infrastructure/api/repositories/user.repository";
import {
  checkSystemUpdates,
  getIngress,
  getSystemVersion,
} from "@/infrastructure/api/repositories/system.repository";
import type { ServiceStatusReport } from "@/core/entities/serviceStatus.entity";
import type { IngressEntry, IngressReport } from "@/core/entities/ingress.entity";
import type { ReleaseCheck, SystemVersionState } from "@/core/entities/systemVersion.entity";
import type { ManagedUser } from "@/core/entities/auth.entity";

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
vi.mock("@/infrastructure/api/repositories/user.repository", () => ({
  searchUsers: vi.fn(),
}));
vi.mock("@/infrastructure/api/repositories/system.repository", () => ({
  getIngress: vi.fn(),
  getSystemVersion: vi.fn(),
  checkSystemUpdates: vi.fn(),
}));

const SHA = "0123456789abcdef0123456789abcdef01234567";

const report = (overrides: Partial<ServiceStatusReport> = {}): ServiceStatusReport => ({
  generatedAt: "2026-10-17T08:00:00Z",
  components: [
    { id: "database", status: "up", detail: "online_judge", latencyMs: 3 },
    { id: "celery", status: "up", detail: "2 worker(s)", latencyMs: 20 },
  ],
  integrity: {
    liveRunCount: 4,
    unhealthyRunCount: 0,
    staleHeartbeatCount: 0,
    neverReportedCount: 0,
    heartbeatStaleAfterSeconds: 120,
    unhealthyRuns: [],
  },
  containers: { agent: "ok", items: [] },
  ...overrides,
});

const user = (id: number, overrides: Partial<ManagedUser> = {}): ManagedUser => ({
  id,
  username: `user-${id}`,
  role: "student",
  onboarding_completed_at: "2026-09-01T00:00:00Z",
  ...overrides,
});

const entry = (overrides: Partial<IngressEntry> = {}): IngressEntry => ({
  id: "site",
  public: "https://oj.example.test",
  target: "http://127.0.0.1:8080",
  probe: "https://oj.example.test/api/health/",
  ok: true,
  detail: "HTTP 200",
  ...overrides,
});

const versionState = (overrides: Partial<SystemVersionState> = {}): SystemVersionState => ({
  agent: "ok",
  version: { current: SHA, previous: null, deployedAt: "2026-10-01T00:00:00Z" },
  job: null,
  log: "",
  externalBusy: false,
  ...overrides,
});

const check = (overrides: Partial<ReleaseCheck> = {}): ReleaseCheck => ({
  latest: { sha: SHA, subject: "feat: newest", committedAt: "2026-10-16T10:00:00Z" },
  releases: [],
  updateAvailable: false,
  ...overrides,
});

const LocationProbe = () => <p data-testid="location">{useLocation().pathname}</p>;
const renderOverview = () =>
  render(
    <MemoryRouter initialEntries={["/system"]}>
      <Routes>
        <Route path="/system" element={<SystemOverviewScreen />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
const tile = (name: string) => screen.getByTestId(`overview-${name}`);

beforeEach(() => {
  vi.mocked(getServiceStatus).mockReset().mockResolvedValue(report());
  vi.mocked(searchUsers).mockReset().mockResolvedValue({
    data: [
      user(1, { role: "admin" }),
      user(2, { role: "teacher" }),
      user(3, { onboarding_completed_at: null }),
    ],
    meta: {},
  });
  vi.mocked(getIngress)
    .mockReset()
    .mockResolvedValue({
      agent: "ok",
      entries: [entry(), entry({ id: "mcp" })],
    } satisfies IngressReport);
  vi.mocked(getSystemVersion).mockReset().mockResolvedValue(versionState());
  vi.mocked(checkSystemUpdates).mockReset().mockResolvedValue(check());
});

describe("SystemOverviewScreen", () => {
  it("summarizes each source on its own tile", async () => {
    renderOverview();

    await waitFor(() =>
      expect(tile("services").textContent).toContain("全部服務正常"),
    );
    await waitFor(() => expect(tile("integrity").textContent).toContain("4 個進行中"));
    expect(tile("integrity").textContent).toContain("全部正常");
    await waitFor(() => expect(tile("users").textContent).toContain("3 位使用者"));
    expect(tile("users").textContent).toContain("1 位教師");
    expect(tile("users").textContent).toContain("1 位未完成 onboarding");
    await waitFor(() => expect(tile("ingress").textContent).toContain("2 / 2 個入口正常"));
    await waitFor(() => expect(tile("version").textContent).toContain("sha-0123456789ab"));
  });

  it("counts failing services and every integrity problem", async () => {
    vi.mocked(getServiceStatus).mockResolvedValue(
      report({
        components: [
          { id: "database", status: "up", detail: "ok", latencyMs: 3 },
          { id: "celery", status: "down", detail: "no worker", latencyMs: null },
          { id: "cache", status: "unknown", detail: "", latencyMs: null },
        ],
        integrity: {
          liveRunCount: 4,
          unhealthyRunCount: 2,
          staleHeartbeatCount: 1,
          neverReportedCount: 1,
          heartbeatStaleAfterSeconds: 120,
          unhealthyRuns: [],
        },
      }),
    );
    vi.mocked(getIngress).mockResolvedValue({
      agent: "ok",
      entries: [entry(), entry({ id: "mcp", ok: false })],
    });

    renderOverview();

    await waitFor(() => expect(tile("services").textContent).toContain("2 項服務異常"));
    expect(tile("integrity").textContent).toContain("4 項異常");
    expect(tile("integrity").textContent).toContain("4 個進行中");
    await waitFor(() => expect(tile("ingress").textContent).toContain("1 / 2 個入口正常"));
  });

  it("counts stopped and unhealthy containers as services too", async () => {
    vi.mocked(getServiceStatus).mockResolvedValue(
      report({
        containers: {
          agent: "ok",
          items: [
            { project: "qjudge", service: "backend", state: "running", health: "healthy" },
            { project: "qjudge", service: "worker", state: "running", health: "unhealthy" },
            { project: "qjudge-storage", service: "minio", state: "exited", health: "" },
          ],
        },
      }),
    );

    renderOverview();

    await waitFor(() => expect(tile("services").textContent).toContain("2 項服務異常"));
    expect(tile("services").textContent).toContain("3 / 5 項正常");
  });

  it("does not call the integrity runs healthy while heartbeats are stale", async () => {
    vi.mocked(getServiceStatus).mockResolvedValue(
      report({
        integrity: {
          liveRunCount: 4,
          unhealthyRunCount: 0,
          staleHeartbeatCount: 1,
          neverReportedCount: 0,
          heartbeatStaleAfterSeconds: 120,
          unhealthyRuns: [],
        },
      }),
    );

    renderOverview();

    await waitFor(() => expect(tile("integrity").textContent).toContain("1 項異常"));
    expect(tile("integrity").textContent).not.toContain("全部正常");
  });

  it("keeps the other tiles when one source fails", async () => {
    vi.mocked(getIngress).mockRejectedValue(new Error("down"));

    renderOverview();

    await waitFor(() =>
      expect(tile("services").textContent).toContain("全部服務正常"),
    );
    expect(tile("ingress").textContent).toContain("無法讀取");
    await waitFor(() => expect(tile("users").textContent).toContain("3 位使用者"));
    await waitFor(() => expect(tile("version").textContent).toContain("sha-0123456789ab"));
  });

  it("fails the service and integrity tiles together without touching the rest", async () => {
    vi.mocked(getServiceStatus).mockRejectedValue(new Error("503"));

    renderOverview();

    await waitFor(() => expect(tile("services").textContent).toContain("無法讀取"));
    expect(tile("integrity").textContent).toContain("無法讀取");
    await waitFor(() => expect(tile("users").textContent).toContain("3 位使用者"));
    await waitFor(() => expect(tile("ingress").textContent).toContain("2 / 2 個入口正常"));
    expect(getServiceStatus).toHaveBeenCalledTimes(1);
  });

  it("fails the users tile alone", async () => {
    vi.mocked(searchUsers).mockRejectedValue(new Error("403"));

    renderOverview();

    await waitFor(() => expect(tile("users").textContent).toContain("無法讀取"));
    await waitFor(() =>
      expect(tile("services").textContent).toContain("全部服務正常"),
    );
  });

  it("flags a new version on the version tile", async () => {
    vi.mocked(checkSystemUpdates).mockResolvedValue(check({ updateAvailable: true }));

    renderOverview();

    await waitFor(() => expect(tile("version").textContent).toContain("有新版"));
  });

  it("shows no new-version flag when the deployment is current", async () => {
    renderOverview();

    await waitFor(() => expect(checkSystemUpdates).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(tile("version").textContent).toContain("sha-0123456789ab"));
    expect(tile("version").textContent).not.toContain("有新版");
  });

  it("still shows the deployed version when the update check fails", async () => {
    vi.mocked(checkSystemUpdates).mockRejectedValue(new Error("git fetch failed"));

    renderOverview();

    await waitFor(() => expect(checkSystemUpdates).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(tile("version").textContent).toContain("sha-0123456789ab"));
    expect(tile("version").textContent).not.toContain("無法讀取");
    expect(tile("version").textContent).not.toContain("有新版");
  });

  it("explains a missing agent on the version tile and does not check for updates", async () => {
    vi.mocked(getSystemVersion).mockResolvedValue(
      versionState({ agent: "unsupported", version: null }),
    );

    renderOverview();

    await waitFor(() =>
      expect(tile("version").textContent).toContain("此環境沒有主機 agent"),
    );
    expect(checkSystemUpdates).not.toHaveBeenCalled();
  });

  it("explains an unreachable agent on the version and ingress tiles", async () => {
    vi.mocked(getSystemVersion).mockResolvedValue(
      versionState({ agent: "unreachable", version: null }),
    );
    vi.mocked(getIngress).mockResolvedValue({ agent: "unreachable", entries: [] });

    renderOverview();

    await waitFor(() =>
      expect(tile("version").textContent).toContain("無法連線到主機 agent"),
    );
    await waitFor(() =>
      expect(tile("ingress").textContent).toContain("無法連線到主機 agent"),
    );
    expect(checkSystemUpdates).not.toHaveBeenCalled();
  });

  it("says so when nothing has been deployed through the release flow yet", async () => {
    vi.mocked(getSystemVersion).mockResolvedValue(
      versionState({ version: { current: null, previous: null, deployedAt: null } }),
    );

    renderOverview();

    await waitFor(() => expect(tile("version").textContent).toContain("尚無版本紀錄"));
  });

  it.each([
    ["services", "/system/service-status"],
    ["integrity", "/system/service-status"],
    ["users", "/system/users"],
    ["ingress", "/system/ingress"],
    ["version", "/system/version"],
  ])("links the %s tile to %s", async (name, path) => {
    renderOverview();
    await waitFor(() => expect(within(tile("users")).queryByText("3 位使用者")).toBeTruthy());

    expect(tile(name).getAttribute("href")).toBe(path);
    await userEvent.click(tile(name));

    expect(screen.getByTestId("location").textContent).toBe(path);
  });
});
