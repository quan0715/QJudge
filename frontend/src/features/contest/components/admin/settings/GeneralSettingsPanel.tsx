import type { ChangeEvent } from "react";
import {
  Tag,
  TextInput,
  SelectItem,
  DatePicker,
  DatePickerInput,
  TimePicker,
  TimePickerSelect,
} from "@carbon/react";
import { MarkdownField } from "@/shared/ui/markdown/markdownEditor";
import { SectionSaveIndicator } from "@/features/contest/components/admin/AdminSettingsPanelLayout";
import { ActionRow, FieldRow, Section } from "@/shared/layout/SettingsPanel";
import type { ContestSettingsPanelProps } from "./contestSettingsPanel.types";

const SAVE_FIELDS = ["name", "description", "startTime", "endTime", "rules"] as const;

interface GeneralSettingsPanelProps extends ContestSettingsPanelProps {
  startDateInput: Date | null;
  endDateInput: Date | null;
  startTimeInput: string;
  endTimeInput: string;
  startMeridiem: "AM" | "PM";
  endMeridiem: "AM" | "PM";
  onStartDateChange: (dates: Date[]) => void;
  onEndDateChange: (dates: Date[]) => void;
  onStartTimeChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onEndTimeChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onStartMeridiemChange: (value: string) => void;
  onEndMeridiemChange: (value: string) => void;
}

export default function GeneralSettingsPanel({
  t,
  tc,
  contest,
  form,
  getState,
  onRetry,
  onChange,
  startDateInput,
  endDateInput,
  startTimeInput,
  endTimeInput,
  startMeridiem,
  endMeridiem,
  onStartDateChange,
  onEndDateChange,
  onStartTimeChange,
  onEndTimeChange,
  onStartMeridiemChange,
  onEndMeridiemChange,
}: GeneralSettingsPanelProps) {
  return (
    <Section
      title={t("settings.basicInfo", "基本資訊")}
      action={<SectionSaveIndicator fields={SAVE_FIELDS} getState={getState} onRetry={onRetry} />}
    >
      <ActionRow
        label={t("settings.contestType", "考試型態")}
        description={t(
          "settings.contestTypeDesc",
          "考試型態在建立競賽時決定，建立後無法變更。",
        )}
      >
        <Tag type="cool-gray" size="md">
          {contest.contestType === "paper_exam"
            ? t("adminOverview.examType.paper_exam", "考卷")
            : t("adminOverview.examType.coding", "程式測驗")}
        </Tag>
      </ActionRow>

      <FieldRow
        label={t("settings.contestName")}
        description="顯示在競賽列表和頁首的名稱"
        descriptionId="settings-name-help"
      >
        <TextInput
          id="settings-name"
          aria-describedby="settings-name-help"
          labelText={t("settings.contestName")}
          hideLabel
          value={(form.name as string) || ""}
          onChange={(e) => onChange("name", e.target.value)}
        />
      </FieldRow>

      <FieldRow
        label={t("settings.contestDescription")}
        description="簡短描述，出現在競賽概覽頁面"
        descriptionId="settings-description-help"
      >
        <TextInput
          id="settings-description"
          aria-describedby="settings-description-help"
          labelText={t("settings.contestDescription")}
          hideLabel
          value={(form.description as string) || ""}
          onChange={(e) => onChange("description", e.target.value)}
        />
      </FieldRow>

      <FieldRow
        label={tc("form.startDate")}
      >
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <DatePicker
            datePickerType="single"
            dateFormat="m/d/Y"
            value={startDateInput ? [startDateInput] : []}
            onChange={onStartDateChange}
          >
            <DatePickerInput
              id="settings-start-date"
              helperText={<span id="settings-start-help">競賽開始時間，學生只能在此時間後進入作答</span>}
              labelText={tc("form.startDate")}
              hideLabel
              placeholder="mm/dd/yyyy"
            />
          </DatePicker>
          <TimePicker
            id="settings-start-time"
            aria-describedby="settings-start-help"
            labelText={tc("form.startTime")}
            hideLabel
            placeholder="hh:mm"
            value={startTimeInput}
            onChange={onStartTimeChange}
          >
            <TimePickerSelect
              id="settings-start-ampm"
              aria-describedby="settings-start-help"
              aria-label={tc("form.startTime") + " AM/PM"}
              value={startMeridiem}
              onChange={(e) => onStartMeridiemChange(e.target.value)}
            >
              <SelectItem value="AM" text="AM" />
              <SelectItem value="PM" text="PM" />
            </TimePickerSelect>
          </TimePicker>
        </div>
      </FieldRow>

      <FieldRow
        label={tc("form.endDate")}
      >
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <DatePicker
            datePickerType="single"
            dateFormat="m/d/Y"
            value={endDateInput ? [endDateInput] : []}
            onChange={onEndDateChange}
          >
            <DatePickerInput
              id="settings-end-date"
              helperText={<span id="settings-end-help">競賽結束時間，超過後將自動停止收卷</span>}
              labelText={tc("form.endDate")}
              hideLabel
              placeholder="mm/dd/yyyy"
            />
          </DatePicker>
          <TimePicker
            id="settings-end-time"
            aria-describedby="settings-end-help"
            labelText={tc("form.endTime")}
            hideLabel
            placeholder="hh:mm"
            value={endTimeInput}
            onChange={onEndTimeChange}
          >
            <TimePickerSelect
              id="settings-end-ampm"
              aria-describedby="settings-end-help"
              aria-label={tc("form.endTime") + " AM/PM"}
              value={endMeridiem}
              onChange={(e) => onEndMeridiemChange(e.target.value)}
            >
              <SelectItem value="AM" text="AM" />
              <SelectItem value="PM" text="PM" />
            </TimePickerSelect>
          </TimePicker>
        </div>
      </FieldRow>

      <FieldRow
        label={t("settings.contestRules")}
        description={t("settings.rulesHelperText")}
      >
        <MarkdownField
          id="settings-rules"
          value={(form.rules as string) || ""}
          onChange={(value) => onChange("rules", value)}
          minHeight="180px"
        />
      </FieldRow>
    </Section>
  );
}
