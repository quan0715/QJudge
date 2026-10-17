import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SystemVersionScreen from "./SystemVersionScreen";
import { POLL_INTERVAL_MS, SWITCHING_WARN_AFTER_MS } from "../hooks/useUpgradeJob";
import { EnvelopeError } from "@/infrastructure/api/envelope";
import {
  checkSystemUpdates,
  getSystemVersion,
  startSystemUpgrade,
} from "@/infrastructure/api/repositories/system.repository";
import type {
  ReleaseCheck,
  SystemVersionState,
  UpgradeJob,
} from "@/core/entities/systemVersion.entity";

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

vi.mock("@/infrastructure/api/repositories/system.repository", () => ({
  getSystemVersion: vi.fn(),
  checkSystemUpdates: vi.fn(),
  startSystemUpgrade: vi.fn(),
}));

const CURRENT = "a".repeat(40);
const LATEST = "b".repeat(40);
const NEWER = "c".repeat(40);

const CONFIRM_TEXT =
  "更新前會先備份資料庫。切換服務時網站會中斷約 30 秒到 1 分鐘，正在作答的學生可能會短暫看到錯誤頁。更新失敗會自動維持在目前版本。";
const SWITCHING_TEXT =
  "正在切換服務，網站暫時無法連線。這是正常的，頁面會自動重新連線，不需要重新整理。";
const SWITCHING_TOO_LONG_TEXT =
  "切換時間超過預期。若網站仍無法連線，請聯絡維護者並提供主機上的 deploy/.agent/job.log。";
const NOT_LATEST_TEXT = "main 已有更新的版本，請確認後再更新";
const HEALTHY_FAILURE_TEXT = "更新失敗，網站維持在 sha-aaaaaaaaaaaa 正常運作。";
const UNHEALTHY_FAILURE_TEXT = "更新失敗，網站可能異常，請把紀錄交給維護者。";

const job = (overrides: Partial<UpgradeJob> = {}): UpgradeJob => ({
  id: "job-1",
  target: LATEST,
  triggeredBy: "admin",
  startedAt: "2026-10-17T08:00:00Z",
  finishedAt: null,
  status: "running",
  step: "backup",
  siteHealthy: null,
  ...overrides,
});

const state = (overrides: Partial<SystemVersionState> = {}): SystemVersionState => ({
  agent: "ok",
  version: { current: CURRENT, previous: null, deployedAt: "2026-10-16T08:00:00Z" },
  job: null,
  log: "",
  externalBusy: false,
  ...overrides,
});

const release = (overrides: Partial<ReleaseCheck> = {}): ReleaseCheck => ({
  latest: { sha: LATEST, subject: "Add the upgrade page", committedAt: "2026-10-17T07:00:00Z" },
  releases: [
    { sha: LATEST, subject: "Add the upgrade page" },
    { sha: "d".repeat(40), subject: "Fix the ingress probe" },
  ],
  updateAvailable: true,
  ...overrides,
});

const stepItem = (label: string) => {
  const item = screen.getByText(label).closest("li");
  if (!item) throw new Error(`no step named ${label}`);
  return item;
};

const openConfirm = async (user: typeof userEvent, name: RegExp | string) => {
  await user.click(await screen.findByRole("button", { name }));
  return screen.findByRole("button", { name: "開始更新" });
};

describe("SystemVersionScreen", () => {
  beforeEach(() => {
    vi.mocked(getSystemVersion).mockReset();
    vi.mocked(checkSystemUpdates).mockReset();
    vi.mocked(startSystemUpgrade).mockReset();
    vi.mocked(checkSystemUpdates).mockResolvedValue(release());
    vi.mocked(navigator.clipboard.writeText).mockClear();
  });

  describe("when idle", () => {
    it("shows the deployed version beside the newest main and checks once on open", async () => {
      vi.mocked(getSystemVersion).mockResolvedValue(state());

      render(<SystemVersionScreen />);

      expect(await screen.findByText("sha-aaaaaaaaaaaa")).toBeTruthy();
      expect(await screen.findByText("sha-bbbbbbbbbbbb")).toBeTruthy();
      expect(screen.getByText("目前版本")).toBeTruthy();
      expect(screen.getByText("main 最新版")).toBeTruthy();
      expect(checkSystemUpdates).toHaveBeenCalledTimes(1);
      expect(getSystemVersion).toHaveBeenCalledTimes(1);
    });

    it("lists what the update contains and offers it by version", async () => {
      vi.mocked(getSystemVersion).mockResolvedValue(state());

      render(<SystemVersionScreen />);

      expect(await screen.findByText("這次更新包含")).toBeTruthy();
      expect(screen.getByText("Add the upgrade page")).toBeTruthy();
      expect(screen.getByText("Fix the ingress probe")).toBeTruthy();
      const update = screen.getByRole("button", { name: "更新到 sha-bbbbbbbbbbbb" });
      expect((update as HTMLButtonElement).disabled).toBe(false);
    });

    it("disables the button and says so when already on the newest version", async () => {
      vi.mocked(getSystemVersion).mockResolvedValue(
        state({ version: { current: LATEST, previous: CURRENT, deployedAt: null } }),
      );
      vi.mocked(checkSystemUpdates).mockResolvedValue(
        release({ releases: [], updateAvailable: false }),
      );

      render(<SystemVersionScreen />);

      const button = await screen.findByRole("button", { name: "已是最新版本" });
      expect((button as HTMLButtonElement).disabled).toBe(true);
      expect(screen.queryByText("這次更新包含")).toBeNull();
    });

    it("says no version is recorded when the host has none", async () => {
      vi.mocked(getSystemVersion).mockResolvedValue(
        state({ version: { current: null, previous: null, deployedAt: null } }),
      );

      render(<SystemVersionScreen />);

      expect(await screen.findByText("尚無版本紀錄")).toBeTruthy();
    });

    it("checks again on demand and while checking disables the button", async () => {
      const user = userEvent;
      vi.mocked(getSystemVersion).mockResolvedValue(state());
      let finish: (value: ReleaseCheck) => void = () => {};
      vi.mocked(checkSystemUpdates)
        .mockResolvedValueOnce(release())
        .mockReturnValueOnce(
          new Promise((resolve) => {
            finish = resolve;
          }),
        );

      render(<SystemVersionScreen />);
      await screen.findByText("sha-bbbbbbbbbbbb");
      const recheck = screen.getByRole("button", { name: "重新檢查" }) as HTMLButtonElement;
      expect(recheck.disabled).toBe(false);

      await user.click(recheck);
      expect(checkSystemUpdates).toHaveBeenCalledTimes(2);
      expect(recheck.disabled).toBe(true);

      await act(async () => {
        finish(
          release({ latest: { sha: NEWER, subject: "Newer", committedAt: "2026-10-17T09:00:00Z" } }),
        );
      });
      expect(await screen.findByText("sha-cccccccccccc")).toBeTruthy();
      expect(recheck.disabled).toBe(false);
    });

    it("reports a failed check without hiding the deployed version", async () => {
      vi.mocked(getSystemVersion).mockResolvedValue(state());
      vi.mocked(checkSystemUpdates).mockRejectedValue(
        new EnvelopeError(503, [
          { code: "agent_unavailable", message: "Host agent is unreachable", field: null, details: { agent: "unreachable" } },
        ]),
      );

      render(<SystemVersionScreen />);

      expect(await screen.findByText("無法檢查新版")).toBeTruthy();
      expect(screen.getByText("Host agent is unreachable")).toBeTruthy();
      expect(screen.getByText("sha-aaaaaaaaaaaa")).toBeTruthy();
      expect(screen.queryByRole("button", { name: /^更新到/ })).toBeNull();
    });
  });

  describe("confirming an upgrade", () => {
    it("explains the cost before anything starts and starts with the full sha", async () => {
      const user = userEvent;
      vi.mocked(getSystemVersion).mockResolvedValue(state());
      vi.mocked(startSystemUpgrade).mockResolvedValue({
        kind: "started",
        job: job({ step: "prepare" }),
      });

      render(<SystemVersionScreen />);
      const confirm = await openConfirm(user, "更新到 sha-bbbbbbbbbbbb");

      expect(screen.getByText(CONFIRM_TEXT)).toBeTruthy();
      expect(startSystemUpgrade).not.toHaveBeenCalled();

      await user.click(confirm);

      expect(startSystemUpgrade).toHaveBeenCalledWith(LATEST);
      expect(await screen.findByText("備份資料庫")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "開始更新" })).toBeNull();
      expect(screen.queryByRole("button", { name: /^更新到/ })).toBeNull();
    });

    it("lets the admin back out", async () => {
      const user = userEvent;
      vi.mocked(getSystemVersion).mockResolvedValue(state());

      render(<SystemVersionScreen />);
      await openConfirm(user, "更新到 sha-bbbbbbbbbbbb");

      await user.click(screen.getByRole("button", { name: "取消" }));

      expect(screen.queryByRole("button", { name: "開始更新" })).toBeNull();
      expect(startSystemUpgrade).not.toHaveBeenCalled();
    });

    it("disables confirm while submitting", async () => {
      const user = userEvent;
      vi.mocked(getSystemVersion).mockResolvedValue(state());
      let finish: (value: Awaited<ReturnType<typeof startSystemUpgrade>>) => void = () => {};
      vi.mocked(startSystemUpgrade).mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );

      render(<SystemVersionScreen />);
      const confirm = await openConfirm(user, "更新到 sha-bbbbbbbbbbbb");

      await user.click(confirm);
      expect((confirm as HTMLButtonElement).disabled).toBe(true);
      await user.click(confirm);
      expect(startSystemUpgrade).toHaveBeenCalledTimes(1);

      await act(async () => {
        finish({ kind: "started", job: job({ step: "prepare" }) });
      });
      expect(await screen.findByText("下載新版並檢查設定")).toBeTruthy();
    });

    it("shows what the agent did when the lock is already held", async () => {
      const user = userEvent;
      vi.mocked(getSystemVersion)
        .mockResolvedValueOnce(state())
        .mockResolvedValueOnce(state({ job: job({ step: "build" }) }));
      vi.mocked(startSystemUpgrade).mockResolvedValue({ kind: "busy" });

      render(<SystemVersionScreen />);
      await user.click(await openConfirm(user, "更新到 sha-bbbbbbbbbbbb"));

      expect(await screen.findByText("建置映像檔")).toBeTruthy();
      expect(getSystemVersion).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole("button", { name: "開始更新" })).toBeNull();
    });

    it("rechecks when target is no longer latest", async () => {
      const user = userEvent;
      vi.mocked(getSystemVersion).mockResolvedValue(state());
      vi.mocked(checkSystemUpdates)
        .mockResolvedValueOnce(release())
        .mockResolvedValueOnce(
          release({ latest: { sha: NEWER, subject: "Newer", committedAt: "2026-10-17T09:00:00Z" } }),
        );
      vi.mocked(startSystemUpgrade).mockResolvedValue({ kind: "notLatest", latest: NEWER });

      render(<SystemVersionScreen />);
      await user.click(await openConfirm(user, "更新到 sha-bbbbbbbbbbbb"));

      expect(await screen.findByText(NOT_LATEST_TEXT)).toBeTruthy();
      expect(checkSystemUpdates).toHaveBeenCalledTimes(2);
      expect(await screen.findByRole("button", { name: "更新到 sha-cccccccccccc" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "開始更新" })).toBeNull();

      // The notice is cleared as soon as the admin looks again.
      await user.click(screen.getByRole("button", { name: "重新檢查" }));
      await waitFor(() => expect(screen.queryByText(NOT_LATEST_TEXT)).toBeNull());
    });

    it("keeps the dialog open and says why when the upgrade cannot start", async () => {
      const user = userEvent;
      vi.mocked(getSystemVersion).mockResolvedValue(state());
      vi.mocked(startSystemUpgrade).mockRejectedValue(new Error("agent exploded"));

      render(<SystemVersionScreen />);
      const confirm = await openConfirm(user, "更新到 sha-bbbbbbbbbbbb");
      await user.click(confirm);

      expect(await screen.findByText("無法開始更新")).toBeTruthy();
      expect(screen.getByText("agent exploded")).toBeTruthy();
      expect(
        (screen.getByRole("button", { name: "開始更新" }) as HTMLButtonElement).disabled,
      ).toBe(false);
    });

    it("follows a job the agent started even when the start request failed", async () => {
      const user = userEvent;
      vi.mocked(getSystemVersion)
        .mockResolvedValueOnce(state())
        .mockResolvedValue(state({ job: job({ step: "prepare" }) }));
      // The backend gave up waiting while the agent was still fetching main, then started anyway.
      vi.mocked(startSystemUpgrade).mockRejectedValue(
        new EnvelopeError(503, [
          { code: "agent_unavailable", message: "Host agent is unreachable", field: null, details: { agent: "unreachable" } },
        ]),
      );

      render(<SystemVersionScreen />);
      await user.click(await openConfirm(user, "更新到 sha-bbbbbbbbbbbb"));

      expect(await screen.findByText("無法開始更新")).toBeTruthy();
      expect(getSystemVersion).toHaveBeenCalledTimes(2);
      await user.click(screen.getByRole("button", { name: "取消" }));
      expect(within(stepItem("下載新版並檢查設定")).getByText("進行中")).toBeTruthy();
      expect(screen.queryByRole("button", { name: /^更新到/ })).toBeNull();
    });
  });

  describe("while an upgrade runs", () => {
    it("resumes a running job on open", async () => {
      vi.mocked(getSystemVersion).mockResolvedValue(state({ job: job({ step: "backup" }) }));

      render(<SystemVersionScreen />);

      await screen.findByText("備份資料庫");
      for (const label of [
        "下載新版並檢查設定",
        "建置映像檔",
        "備份資料庫",
        "資料庫遷移",
        "切換服務",
        "健康檢查",
      ]) {
        expect(screen.getByText(label)).toBeTruthy();
      }
      expect(within(stepItem("下載新版並檢查設定")).getByText("已完成")).toBeTruthy();
      expect(within(stepItem("建置映像檔")).getByText("已完成")).toBeTruthy();
      expect(within(stepItem("備份資料庫")).getByText("進行中")).toBeTruthy();
      expect(within(stepItem("資料庫遷移")).getByText("尚未開始")).toBeTruthy();
      expect(screen.queryByRole("button", { name: /更新到/ })).toBeNull();
      expect(screen.queryByRole("button", { name: "重新檢查" })).toBeNull();
      expect(screen.queryByText(SWITCHING_TEXT)).toBeNull();
      expect(checkSystemUpdates).not.toHaveBeenCalled();
    });

    it("lets the log be expanded and copied", async () => {
      const user = userEvent;
      vi.mocked(getSystemVersion).mockResolvedValue(
        state({ job: job({ step: "build" }), log: "==> build\nstep 1/9" }),
      );

      render(<SystemVersionScreen />);
      const toggle = await screen.findByRole("button", { name: "詳細紀錄" });

      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      expect(screen.queryByText(/step 1\/9/)).toBeNull();

      await user.click(toggle);
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      expect(screen.getByText(/step 1\/9/).textContent).toBe("==> build\nstep 1/9");

      await user.click(screen.getByRole("button", { name: "複製紀錄" }));
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("==> build\nstep 1/9");
    });

    it("leaves the log out until the job has written something", async () => {
      vi.mocked(getSystemVersion).mockResolvedValue(state({ job: job({ step: "prepare" }), log: "" }));

      render(<SystemVersionScreen />);
      await screen.findByText("下載新版並檢查設定");

      expect(screen.queryByRole("button", { name: "詳細紀錄" })).toBeNull();
      expect(screen.queryByRole("button", { name: "複製紀錄" })).toBeNull();
    });
  });

  describe("with fake timers", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-17T08:02:05Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const flush = () =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

    it("shows the elapsed time and keeps it ticking", async () => {
      vi.mocked(getSystemVersion).mockResolvedValue(state({ job: job({ step: "build" }) }));

      render(<SystemVersionScreen />);
      await flush();
      expect(screen.getByText("經過時間 02:05")).toBeTruthy();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(screen.getByText("經過時間 02:06")).toBeTruthy();
    });

    it("explains the switch without showing an error when the API drops", async () => {
      vi.mocked(getSystemVersion)
        .mockResolvedValueOnce(state({ job: job({ step: "switch" }) }))
        .mockRejectedValue(new TypeError("Failed to fetch"));

      render(<SystemVersionScreen />);
      await flush();
      expect(screen.queryByText(SWITCHING_TEXT)).toBeNull();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });

      expect(screen.getByText(SWITCHING_TEXT)).toBeTruthy();
      expect(screen.queryByText("Failed to fetch")).toBeNull();
      expect(screen.queryByText("無法讀取系統版本")).toBeNull();
      expect(within(stepItem("切換服務")).getByText("進行中")).toBeTruthy();

      // The notice goes away by itself once the API answers again.
      vi.mocked(getSystemVersion).mockResolvedValue(state({ job: job({ step: "verify" }) }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(screen.queryByText(SWITCHING_TEXT)).toBeNull();
      expect(within(stepItem("健康檢查")).getByText("進行中")).toBeTruthy();
    });
  });

  describe("when switching services takes too long", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const advance = (ms: number) =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });

    it("keeps reassuring for ten minutes, then warns and points to the job log", async () => {
      vi.mocked(getSystemVersion)
        .mockResolvedValueOnce(state({ job: job({ step: "switch" }) }))
        .mockRejectedValue(new TypeError("Failed to fetch"));

      render(<SystemVersionScreen />);
      await advance(0);
      await advance(POLL_INTERVAL_MS);
      expect(screen.getByText(SWITCHING_TEXT)).toBeTruthy();

      await advance(SWITCHING_WARN_AFTER_MS - POLL_INTERVAL_MS);
      expect(screen.getByText(SWITCHING_TEXT)).toBeTruthy();
      expect(screen.queryByText(SWITCHING_TOO_LONG_TEXT)).toBeNull();

      await advance(POLL_INTERVAL_MS);
      expect(screen.getByText(SWITCHING_TOO_LONG_TEXT)).toBeTruthy();
      expect(screen.queryByText(SWITCHING_TEXT)).toBeNull();
      // Still no error page, and the steps stay on screen.
      expect(screen.queryByText("無法讀取系統版本")).toBeNull();
      expect(within(stepItem("切換服務")).getByText("進行中")).toBeTruthy();
    });

    it("drops the warning when the API answers again", async () => {
      vi.mocked(getSystemVersion)
        .mockResolvedValueOnce(state({ job: job({ step: "switch" }) }))
        .mockRejectedValue(new TypeError("Failed to fetch"));

      render(<SystemVersionScreen />);
      await advance(0);
      await advance(SWITCHING_WARN_AFTER_MS + POLL_INTERVAL_MS * 2);
      expect(screen.getByText(SWITCHING_TOO_LONG_TEXT)).toBeTruthy();

      vi.mocked(getSystemVersion).mockResolvedValue(state({ job: job({ step: "verify" }) }));
      await advance(POLL_INTERVAL_MS);

      expect(screen.queryByText(SWITCHING_TOO_LONG_TEXT)).toBeNull();
      expect(screen.queryByText(SWITCHING_TEXT)).toBeNull();
      expect(within(stepItem("健康檢查")).getByText("進行中")).toBeTruthy();
    });
  });

  describe("when the upgrade finished", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("announces the new version without reloading a page that opened on it", async () => {
      const reload = vi.fn();
      vi.stubGlobal("location", { ...window.location, reload });
      vi.mocked(getSystemVersion).mockResolvedValue(
        state({
          version: { current: LATEST, previous: CURRENT, deployedAt: "2026-10-17T08:10:00Z" },
          job: job({ status: "succeeded", step: "verify", finishedAt: "2026-10-17T08:10:00Z" }),
        }),
      );
      vi.mocked(checkSystemUpdates).mockResolvedValue(
        release({ releases: [], updateAvailable: false }),
      );

      render(<SystemVersionScreen />);

      expect(await screen.findByText("已更新到 sha-bbbbbbbbbbbb")).toBeTruthy();
      // The page still lets the admin look for the next release.
      expect(await screen.findByRole("button", { name: "已是最新版本" })).toBeTruthy();
      expect(reload).not.toHaveBeenCalled();
    });

    it("says the site still runs the old version only when it is healthy", async () => {
      vi.mocked(getSystemVersion).mockResolvedValue(
        state({
          job: job({ status: "failed", step: "migrate", siteHealthy: true, finishedAt: "2026-10-17T08:05:00Z" }),
        }),
      );

      const { unmount } = render(<SystemVersionScreen />);
      expect(await screen.findByText(HEALTHY_FAILURE_TEXT)).toBeTruthy();
      expect(screen.queryByText(UNHEALTHY_FAILURE_TEXT)).toBeNull();
      unmount();

      for (const siteHealthy of [false, null]) {
        vi.mocked(getSystemVersion).mockResolvedValue(
          state({
            job: job({ status: "failed", step: "migrate", siteHealthy, finishedAt: "2026-10-17T08:05:00Z" }),
          }),
        );
        const view = render(<SystemVersionScreen />);
        expect(await screen.findByText(UNHEALTHY_FAILURE_TEXT)).toBeTruthy();
        expect(screen.queryByText(HEALTHY_FAILURE_TEXT)).toBeNull();
        view.unmount();
      }
    });

    it("does not name a version when the host has none recorded", async () => {
      vi.mocked(getSystemVersion).mockResolvedValue(
        state({
          version: { current: null, previous: null, deployedAt: null },
          job: job({ status: "failed", step: "prepare", siteHealthy: true, finishedAt: "2026-10-17T08:05:00Z" }),
        }),
      );

      render(<SystemVersionScreen />);

      expect(await screen.findByText("更新失敗，網站維持在目前版本正常運作。")).toBeTruthy();
    });

    it("names the failed step and keeps the log within reach", async () => {
      const user = userEvent;
      vi.mocked(getSystemVersion).mockResolvedValue(
        state({
          job: job({ status: "failed", step: "migrate", siteHealthy: true, finishedAt: "2026-10-17T08:05:00Z" }),
          log: "migrate failed",
        }),
      );

      render(<SystemVersionScreen />);

      expect(await screen.findByText("失敗的步驟：資料庫遷移")).toBeTruthy();
      expect(within(stepItem("資料庫遷移")).getByText("發生錯誤")).toBeTruthy();
      expect(within(stepItem("備份資料庫")).getByText("已完成")).toBeTruthy();
      expect(within(stepItem("切換服務")).getByText("尚未開始")).toBeTruthy();

      await user.click(screen.getByRole("button", { name: "詳細紀錄" }));
      expect(screen.getByText("migrate failed")).toBeTruthy();
      await user.click(screen.getByRole("button", { name: "複製紀錄" }));
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("migrate failed");
    });

    it("rechecks and then confirms when retrying a failed upgrade", async () => {
      const user = userEvent;
      vi.mocked(getSystemVersion).mockResolvedValue(
        state({
          job: job({ status: "failed", step: "build", siteHealthy: true, finishedAt: "2026-10-17T08:05:00Z" }),
        }),
      );
      vi.mocked(checkSystemUpdates).mockResolvedValue(
        release({ latest: { sha: NEWER, subject: "Newer", committedAt: "2026-10-17T09:00:00Z" } }),
      );
      vi.mocked(startSystemUpgrade).mockResolvedValue({
        kind: "started",
        job: job({ id: "job-2", target: NEWER, step: "prepare" }),
      });

      render(<SystemVersionScreen />);
      const retry = await screen.findByRole("button", { name: "再試一次" });
      expect(checkSystemUpdates).not.toHaveBeenCalled();

      await user.click(retry);

      const confirm = await screen.findByRole("button", { name: "開始更新" });
      expect(checkSystemUpdates).toHaveBeenCalledTimes(1);
      expect(screen.getByText(CONFIRM_TEXT)).toBeTruthy();
      expect(screen.getByText("確認更新到 sha-cccccccccccc")).toBeTruthy();

      await user.click(confirm);
      expect(startSystemUpgrade).toHaveBeenCalledWith(NEWER);
    });

    it("offers retry after interruption", async () => {
      const user = userEvent;
      vi.mocked(getSystemVersion).mockResolvedValue(
        state({ job: job({ status: "interrupted", step: "build" }) }),
      );

      render(<SystemVersionScreen />);

      expect(
        await screen.findByText("上次更新在進行中被中斷，網站狀態以目前版本為準。"),
      ).toBeTruthy();
      expect(within(stepItem("下載新版並檢查設定")).getByText("已完成")).toBeTruthy();
      expect(within(stepItem("建置映像檔")).getByText("已中斷")).toBeTruthy();
      expect(within(stepItem("備份資料庫")).getByText("尚未開始")).toBeTruthy();
      await user.click(screen.getByRole("button", { name: "再試一次" }));
      expect(await screen.findByRole("button", { name: "開始更新" })).toBeTruthy();
      expect(checkSystemUpdates).toHaveBeenCalledTimes(1);
    });

    it("does not open the dialog when retrying finds nothing new", async () => {
      const user = userEvent;
      vi.mocked(getSystemVersion).mockResolvedValue(
        state({ job: job({ status: "interrupted", step: "verify" }) }),
      );
      vi.mocked(checkSystemUpdates).mockResolvedValue(
        release({ releases: [], updateAvailable: false }),
      );

      render(<SystemVersionScreen />);
      await user.click(await screen.findByRole("button", { name: "再試一次" }));

      expect(await screen.findByText("已是最新版本")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "開始更新" })).toBeNull();
    });

    it("does not open the dialog when retrying cannot check for updates", async () => {
      const user = userEvent;
      vi.mocked(getSystemVersion).mockResolvedValue(
        state({ job: job({ status: "interrupted", step: "verify" }) }),
      );
      vi.mocked(checkSystemUpdates).mockRejectedValue(new Error("github is down"));

      render(<SystemVersionScreen />);
      await user.click(await screen.findByRole("button", { name: "再試一次" }));

      expect(await screen.findByText("無法檢查新版")).toBeTruthy();
      expect(screen.getByText("github is down")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "開始更新" })).toBeNull();
    });
  });

  describe("when no upgrade is possible", () => {
    it("explains unsupported environments", async () => {
      vi.mocked(getSystemVersion).mockResolvedValue(
        state({ agent: "unsupported", version: null }),
      );

      render(<SystemVersionScreen />);

      expect(await screen.findByText("此環境不支援線上更新")).toBeTruthy();
      expect(checkSystemUpdates).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: /更新到/ })).toBeNull();
    });

    it("explains an unreachable agent and offers to reconnect", async () => {
      const user = userEvent;
      vi.mocked(getSystemVersion)
        .mockResolvedValueOnce(state({ agent: "unreachable", version: null }))
        .mockResolvedValueOnce(state());

      render(<SystemVersionScreen />);

      expect(await screen.findByText("無法連線到主機 agent")).toBeTruthy();
      expect(checkSystemUpdates).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: "重新連線" }));

      expect(await screen.findByText("sha-aaaaaaaaaaaa")).toBeTruthy();
      expect(screen.queryByText("無法連線到主機 agent")).toBeNull();
    });

    it("reconnects by itself when the agent comes back after a reload that followed an upgrade", async () => {
      vi.useFakeTimers();
      const reload = vi.fn();
      vi.stubGlobal("location", { ...window.location, reload });
      try {
        vi.mocked(getSystemVersion)
          .mockResolvedValueOnce(state({ agent: "unreachable", version: null }))
          .mockResolvedValue(
            state({
              version: { current: LATEST, previous: CURRENT, deployedAt: "2026-10-17T08:10:00Z" },
              job: job({ status: "succeeded", step: "verify", finishedAt: "2026-10-17T08:10:00Z" }),
            }),
          );
        vi.mocked(checkSystemUpdates).mockResolvedValue(
          release({ releases: [], updateAvailable: false }),
        );

        render(<SystemVersionScreen />);
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0);
        });
        expect(screen.getByText("無法連線到主機 agent")).toBeTruthy();
        expect(screen.getByRole("button", { name: "重新連線" })).toBeTruthy();

        await act(async () => {
          await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
        });

        expect(screen.getByText("已更新到 sha-bbbbbbbbbbbb")).toBeTruthy();
        expect(screen.queryByText("無法連線到主機 agent")).toBeNull();
        expect(screen.queryByRole("button", { name: "重新連線" })).toBeNull();
        expect(reload).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
        vi.unstubAllGlobals();
      }
    });

    it("still shows the deployed version when the host reported one", async () => {
      vi.mocked(getSystemVersion).mockResolvedValue(state({ agent: "unsupported" }));

      render(<SystemVersionScreen />);

      expect(await screen.findByText("此環境不支援線上更新")).toBeTruthy();
      expect(screen.getByText("sha-aaaaaaaaaaaa")).toBeTruthy();
    });

    it("reports a failed first load instead of a blank page", async () => {
      vi.mocked(getSystemVersion).mockRejectedValue(new TypeError("Failed to fetch"));

      render(<SystemVersionScreen />);

      expect(await screen.findByText("無法讀取系統版本")).toBeTruthy();
      expect(screen.getByText("Failed to fetch")).toBeTruthy();
      expect(screen.getByRole("button", { name: "重新連線" })).toBeTruthy();
    });

    it("waits while another release is running and keeps the button disabled", async () => {
      vi.mocked(getSystemVersion).mockResolvedValue(state({ externalBusy: true }));

      render(<SystemVersionScreen />);

      expect(
        await screen.findByText("另一個更新正在進行（由終端機或 CD 觸發）"),
      ).toBeTruthy();
      const button = screen.getByRole("button", { name: "更新" });
      expect((button as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByText("sha-aaaaaaaaaaaa")).toBeTruthy();
      expect(checkSystemUpdates).not.toHaveBeenCalled();
    });

    it("checks for a newer release once the other update finishes", async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(getSystemVersion)
          .mockResolvedValueOnce(state({ externalBusy: true }))
          .mockResolvedValue(state());

        render(<SystemVersionScreen />);
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0);
        });
        expect(checkSystemUpdates).not.toHaveBeenCalled();

        await act(async () => {
          await vi.advanceTimersByTimeAsync(3000);
        });

        expect(checkSystemUpdates).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("button", { name: "更新到 sha-bbbbbbbbbbbb" })).toBeTruthy();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
