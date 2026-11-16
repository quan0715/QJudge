import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createMockContest } from "@/shared/mocks/contest.mock";
import GeneralSettingsPanel from "./GeneralSettingsPanel";
import type { ContestSettingsPanelProps } from "./contestSettingsPanel.types";

// Keep real Carbon inputs; the calendar integration is outside this label test.
vi.mock("@carbon/react", async (importOriginal) => ({
  ...await importOriginal<typeof import("@carbon/react")>(),
  DatePicker: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/shared/ui/markdown/markdownEditor", () => ({
  MarkdownField: ({ id, value }: {
    id: string;
    value: string;
  }) => <div id={id}>{value}</div>,
}));

const t = ((key: string) => key) as ContestSettingsPanelProps["t"];
const tc = ((key: string) => key) as ContestSettingsPanelProps["tc"];

const isBefore = (first: Element, second: Element) =>
  Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("GeneralSettingsPanel", () => {
  it("places the contest window immediately after the description", () => {
    const onChange = vi.fn();
    render(
      <GeneralSettingsPanel
        t={t}
        tc={tc}
        contest={createMockContest()}
        form={{ name: "期中考", description: "題目說明", rules: "請遵守規則" }}
        getState={() => undefined}
        onRetry={() => {}}
        onChange={onChange}
        onConfirmedChange={() => {}}
        startDateInput={new Date("2026-09-08T09:00:00")}
        endDateInput={new Date("2026-09-08T11:00:00")}
        startTimeInput="09:00"
        endTimeInput="11:00"
        startMeridiem="AM"
        endMeridiem="AM"
        onStartDateChange={() => {}}
        onEndDateChange={() => {}}
        onStartTimeChange={() => {}}
        onEndTimeChange={() => {}}
        onStartMeridiemChange={() => {}}
        onEndMeridiemChange={() => {}}
      />,
    );

    const name = screen.getByRole("textbox", { name: "settings.contestName" });
    fireEvent.change(name, { target: { value: "New exam" } });
    expect(onChange).toHaveBeenCalledWith("name", "New exam");
    expect(screen.getByRole("textbox", { name: "settings.contestDescription" })).toHaveAccessibleDescription("簡短描述，出現在競賽概覽頁面");
    expect(screen.getByLabelText("form.startDate")).toHaveAccessibleDescription("競賽開始時間，學生只能在此時間後進入作答");
    expect(screen.getByLabelText("form.endDate")).toHaveAccessibleDescription("競賽結束時間，超過後將自動停止收卷");
    const description = document.getElementById("settings-description");
    const startDate = document.getElementById("settings-start-date");
    const endDate = document.getElementById("settings-end-date");
    const rules = document.getElementById("settings-rules");

    expect(description).not.toBeNull();
    expect(startDate).not.toBeNull();
    expect(endDate).not.toBeNull();
    expect(rules).not.toBeNull();
    expect(isBefore(description!, startDate!)).toBe(true);
    expect(isBefore(startDate!, endDate!)).toBe(true);
    expect(isBefore(endDate!, rules!)).toBe(true);
  });
});
