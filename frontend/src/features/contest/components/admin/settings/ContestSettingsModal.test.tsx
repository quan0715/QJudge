import { render } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { createMockContest, stubT } from "@/shared/mocks/contest.mock";
import type { ContestSettingsPanelProps } from "./contestSettingsPanel.types";
import ContestSettingsModal from "./ContestSettingsModal";

const settingsModalProps = vi.hoisted(() => ({
  current: null as { initialActiveId?: string } | null,
}));

vi.mock("@/shared/ui/modal/SettingsModal", () => ({
  SettingsModal: (props: {
    initialActiveId?: string;
  }) => {
    settingsModalProps.current = props;
    return null;
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
      onDelete={() => {}}
      {...overrides}
    />,
  );

describe("ContestSettingsModal", () => {
  it("forwards the requested initial section to the settings modal", () => {
    renderModal({ initialActiveId: "general" });

    expect(settingsModalProps.current?.initialActiveId).toBe("general");
  });
});
