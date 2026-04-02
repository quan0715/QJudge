import type { ChangeEvent } from "react";
import {
  TextInput,
  SelectItem,
  DatePicker,
  DatePickerInput,
  TimePicker,
  TimePickerSelect,
} from "@carbon/react";
import { MarkdownField } from "@/shared/ui/markdown/markdownEditor";
import {
  Section,
  FieldRow,
} from "@/features/contest/components/admin/AdminSettingsPanelLayout";
import type { ContestSettingsPanelProps } from "./ContestSettingsPanelProps";

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
    <Section title="基本資訊">
      <FieldRow
        label={t("settings.contestName")}
        description="顯示在競賽列表和頁首的名稱"
        saveState={getState("name")}
        onRetry={() => onRetry("name")}
      >
        <TextInput
          id="settings-name"
          labelText=""
          hideLabel
          value={(form.name as string) || ""}
          onChange={(e) => onChange("name", e.target.value)}
        />
      </FieldRow>

      <FieldRow
        label={t("settings.contestDescription")}
        description="簡短描述，出現在競賽概覽頁面"
        saveState={getState("description")}
        onRetry={() => onRetry("description")}
      >
        <TextInput
          id="settings-description"
          labelText=""
          hideLabel
          value={(form.description as string) || ""}
          onChange={(e) => onChange("description", e.target.value)}
        />
      </FieldRow>

      <FieldRow
        label={t("settings.contestRules")}
        description={t("settings.rulesHelperText")}
        saveState={getState("rules")}
        onRetry={() => onRetry("rules")}
      >
        <MarkdownField
          id="settings-rules"
          value={(form.rules as string) || ""}
          onChange={(value) => onChange("rules", value)}
          minHeight="180px"
        />
      </FieldRow>

      <FieldRow
        label={tc("form.startDate")}
        description="競賽開始時間，學生只能在此時間後進入作答"
        saveState={getState("startTime")}
        onRetry={() => onRetry("startTime")}
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
              labelText=""
              hideLabel
              placeholder="mm/dd/yyyy"
            />
          </DatePicker>
          <TimePicker
            id="settings-start-time"
            labelText=""
            hideLabel
            placeholder="hh:mm"
            value={startTimeInput}
            onChange={onStartTimeChange}
          >
            <TimePickerSelect
              id="settings-start-ampm"
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
        description="競賽結束時間，超過後將自動停止收卷"
        saveState={getState("endTime")}
        onRetry={() => onRetry("endTime")}
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
              labelText=""
              hideLabel
              placeholder="mm/dd/yyyy"
            />
          </DatePicker>
          <TimePicker
            id="settings-end-time"
            labelText=""
            hideLabel
            placeholder="hh:mm"
            value={endTimeInput}
            onChange={onEndTimeChange}
          >
            <TimePickerSelect
              id="settings-end-ampm"
              value={endMeridiem}
              onChange={(e) => onEndMeridiemChange(e.target.value)}
            >
              <SelectItem value="AM" text="AM" />
              <SelectItem value="PM" text="PM" />
            </TimePickerSelect>
          </TimePicker>
        </div>
      </FieldRow>
    </Section>
  );
}
