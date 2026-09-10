import { render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { createMockContest, stubT } from "@/shared/mocks/contest.mock";
import type { ContestSettingsPanelProps } from "./contestSettingsPanel.types";
import ContestSettingsModal from "./ContestSettingsModal";

const settingsModalProps = vi.hoisted(() => ({
  current: null as { initialActiveId?: string } | null,
}));

vi.mock("@/shared/ui/modal/SettingsModal", () => ({
  SettingsModal: (props: {
    navItems: Array<{ id: string; label: string }>;
    renderPanel: (activeId: string) => ReactNode;
    initialActiveId?: string;
  }) => {
    settingsModalProps.current = props;
    return (
      <div>
        {props.navItems.map((item) => <button key={item.id}>{item.label}</button>)}
        {props.renderPanel("integrity")}
      </div>
    );
  },
}));

const contest = { ...createMockContest(), id: "contest-1", name: "Integrity exam" };
const t = stubT as ContestSettingsPanelProps["t"];
const tc = stubT as ContestSettingsPanelProps["tc"];

const renderModal = (
  overrides: Partial<ComponentProps<typeof ContestSettingsModal>> = {},
) =>
  render(
    <ContestSettingsModal
      open
      onRequestClose={() => {}}
      t={t}
      tc={tc}
      contest={contest}
      form={{}}
      getState={() => undefined}
      onRetry={() => {}}
      onChange={() => {}}
      onConfirmedChange={() => {}}
      startDateInput={null}
      endDateInput={null}
      startTimeInput=""
      endTimeInput=""
      startMeridiem="AM"
      endMeridiem="AM"
      onStartDateChange={() => {}}
      onEndDateChange={() => {}}
      onStartTimeChange={() => {}}
      onEndTimeChange={() => {}}
      onStartMeridiemChange={() => {}}
      onEndMeridiemChange={() => {}}
      onArchive={() => {}}
      onDelete={() => {}}
      {...overrides}
    />,
  );

describe("ContestSettingsModal", () => {
  it("keeps contest settings to what a teacher can configure", () => {
    renderModal();

    // Integrity run state is operational, not configuration. It moved to the
    // platform service panel once the resident session took over the lifecycle
    // and left this tab with nothing a teacher could act on.
    expect(
      screen.queryByRole("button", { name: "Integrity Worker" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("integrity-run-control")).not.toBeInTheDocument();
  });

  it("forwards the requested initial section to the settings modal", () => {
    renderModal({ initialActiveId: "general" });

    expect(settingsModalProps.current?.initialActiveId).toBe("general");
  });
});
