import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { createMockContest } from "@/shared/mocks/contest.mock";
import GeneralSettingsPanel from "./GeneralSettingsPanel";
import type { ContestSettingsPanelProps } from "./contestSettingsPanel.types";

vi.mock("@carbon/react", () => ({
  DatePicker: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DatePickerInput: ({ id }: { id: string }) => <div id={id} />,
  SelectItem: ({ value, text }: { value: string; text: string }) => (
    <option value={value}>{text}</option>
  ),
  Tag: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  TextInput: ({ id }: { id: string }) => <div id={id} />,
  TimePicker: ({ id, children }: { id: string; children: ReactNode }) => (
    <div>
      <div id={id} />
      {children}
    </div>
  ),
  TimePickerSelect: ({ id, children }: { id: string; children: ReactNode }) => (
    <div id={id}>{children}</div>
  ),
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
    render(
      <GeneralSettingsPanel
        t={t}
        tc={tc}
        contest={createMockContest()}
        form={{ name: "期中考", description: "題目說明", rules: "請遵守規則" }}
        getState={() => undefined}
        onRetry={() => {}}
        onChange={() => {}}
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
