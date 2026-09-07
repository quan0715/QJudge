import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

// Mirrors the two i18next call shapes this component uses: t(key, fallback)
// and t(key, { defaultValue, ...values }). The global mock in test/setup.ts
// does not interpolate, so the countdown assertion needs this one.
vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, second?: string | Record<string, unknown>) => {
      if (typeof second === "string") return second;
      if (!second || typeof second.defaultValue !== "string") return key;
      return second.defaultValue.replace(
        /\{\{(\w+)\}\}/g,
        (_, name: string) => String(second[name] ?? ""),
      );
    },
    i18n: { language: "zh-TW", changeLanguage: vi.fn() },
  }),
  Trans: ({ children }: { children: ReactNode }) => children,
}));
import type { AdminPreparationOverviewData } from "@/features/contest/screens/admin/panels/adminOverviewDashboard.model";
import AdminPreparationCommandCenter from "./AdminPreparationCommandCenter";

const baseData: AdminPreparationOverviewData = {
  phase: "draft",
  infoCells: [
    { key: "contestType", label: "考卷題型", value: "Coding Test" },
    { key: "problems", label: "題目數量", value: "2" },
    { key: "participants", label: "考生人數", value: "3" },
  ],
  checklist: [
    {
      key: "schedule",
      level: "blocking",
      title: "考試時間",
      description: "尚未設定，發布前必填",
      actionLabel: "設定時間",
    },
    {
      key: "problems",
      level: "done",
      title: "題目準備",
      description: "已設定 2 題",
      actionLabel: "前往題目管理",
    },
  ],
  blockingKeys: ["schedule"],
  canPublish: false,
  countdownMs: null,
  participants: [
    { userId: "u1", displayName: "林品儀", username: "114705061" },
  ],
};

const renderCenter = (overrides: Partial<AdminPreparationOverviewData> = {}) => {
  const handlers = {
    onItemAction: vi.fn(),
    onPublishContest: vi.fn(),
    onRevertToDraft: vi.fn(),
    onPreviewAsStudent: vi.fn(),
    onOpenContestHome: vi.fn(),
    onOpenAttendanceProjection: vi.fn(),
  };
  render(
    <AdminPreparationCommandCenter
      header={<h2>管理總覽</h2>}
      data={{ ...baseData, ...overrides }}
      publishing={false}
      attendanceCheckEnabled={false}
      {...handlers}
    />,
  );
  return handlers;
};

describe("AdminPreparationCommandCenter", () => {
  it("shows the review step in draft", () => {
    renderCenter();

    expect(screen.getByRole("button", { name: /確認資訊並發布競賽/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /退回草稿/ }),
    ).not.toBeInTheDocument();
  });

  it("publishes only after confirming a ready exam in the review dialog", async () => {
    const handlers = renderCenter({ canPublish: true, blockingKeys: [] });

    await userEvent.click(screen.getByRole("button", { name: /確認資訊並發布競賽/ }));
    expect(handlers.onPublishContest).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "發布競賽" }));

    expect(handlers.onPublishContest).toHaveBeenCalledTimes(1);
  });

  it("swaps the primary action for entry links once upcoming", () => {
    renderCenter({
      phase: "upcoming",
      canPublish: true,
      blockingKeys: [],
      countdownMs: 2 * 60 * 60 * 1000,
    });

    expect(
      screen.queryByRole("button", { name: "發布競賽" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /退回草稿/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("距離開考 2h 0m")).toBeInTheDocument();
  });

  it("lists participants without score or connection columns", () => {
    renderCenter();

    expect(screen.getByText("林品儀")).toBeInTheDocument();
    expect(screen.queryByText("0.00")).not.toBeInTheDocument();
    expect(screen.queryByText("離線")).not.toBeInTheDocument();
  });

  it("shows an empty state when nobody has been added", () => {
    renderCenter({ participants: [] });

    expect(screen.getByText("尚未加入任何考生")).toBeInTheDocument();
  });

  it("keeps publication disabled while required settings are missing", async () => {
    const handlers = renderCenter();
    await userEvent.click(screen.getByRole("button", { name: /確認資訊並發布競賽/ }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("請先完成競賽資訊設定，再發布競賽。")).toBeVisible();
    const publish = dialog.getByRole("button", { name: "發布競賽" });
    expect(publish).toBeDisabled();
    await userEvent.click(publish);
    expect(handlers.onPublishContest).not.toHaveBeenCalled();
  });
});
