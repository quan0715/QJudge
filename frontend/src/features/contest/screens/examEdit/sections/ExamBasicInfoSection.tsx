import React from "react";
import {
  TextInput,
  TextArea,
  DatePicker,
  DatePickerInput,
  TimePicker,
  Select,
  SelectItem,
} from "@carbon/react";
import { useFormContext } from "react-hook-form";
import { FieldSaveIndicator } from "@/shared/ui/autoSave";
import type { ExamFormSchema } from "../forms/examFormSchema";
import { useExamEdit } from "../contexts/ExamEditContext";

interface ExamBasicInfoSectionProps {
  registerRef: (el: HTMLElement | null) => void;
}

const fieldRow: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0.5rem",
};

const fieldFlex: React.CSSProperties = { flex: 1, minWidth: 0 };

const indicatorOffset: React.CSSProperties = {
  marginTop: "1.5rem",
  flexShrink: 0,
};

const ExamBasicInfoSection: React.FC<ExamBasicInfoSectionProps> = ({ registerRef }) => {
  const { setValue, watch, formState: { errors } } = useFormContext<ExamFormSchema>();
  const { handleFieldChange, getFieldSaveState } = useExamEdit();

  const visibility = watch("visibility");

  const handleTextChange = (field: keyof ExamFormSchema, value: string) => {
    setValue(field, value);
    handleFieldChange(field, value);
  };

  const handleSelectChange = (field: keyof ExamFormSchema, value: string) => {
    setValue(field, value);
    handleFieldChange(field, value);
  };

  const handleDateTimeChange = (
    field: "startTime" | "endTime",
    dateStr: string,
    timeStr: string
  ) => {
    if (!dateStr) return;
    const timePart = timeStr || "00:00";
    const iso = `${dateStr}T${timePart}:00`;
    const parsed = new Date(iso);
    if (isNaN(parsed.getTime())) return;
    const isoString = parsed.toISOString();
    setValue(field, isoString);
    handleFieldChange(field, isoString);
  };

  const parseDateTime = (isoString: string) => {
    if (!isoString) return { date: "", time: "" };
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return { date: "", time: "" };
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return {
      date: `${month}/${day}/${year}`,
      time: `${hours}:${minutes}`,
    };
  };

  const startParsed = parseDateTime(watch("startTime"));
  const endParsed = parseDateTime(watch("endTime"));

  return (
    <section id="basic-info" ref={registerRef}>
      <h3
        style={{
          fontSize: "var(--cds-heading-03-font-size)",
          fontWeight: 600,
          marginBottom: "1.5rem",
        }}
      >
        基本資訊
      </h3>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* Name */}
        <div style={fieldRow}>
          <div style={fieldFlex}>
            <TextInput
              id="exam-name"
              labelText="考試名稱"
              required
              value={watch("name")}
              invalid={!!errors.name}
              invalidText={errors.name?.message}
              onChange={(e) => handleTextChange("name", e.target.value)}
            />
          </div>
          <div style={indicatorOffset}>
            <FieldSaveIndicator status={getFieldSaveState("name")?.status || "idle"} />
          </div>
        </div>

        {/* Description */}
        <div style={fieldRow}>
          <div style={fieldFlex}>
            <TextArea
              id="exam-description"
              labelText="考試描述"
              value={watch("description")}
              onChange={(e) => handleTextChange("description", e.target.value)}
              rows={3}
            />
          </div>
          <div style={indicatorOffset}>
            <FieldSaveIndicator status={getFieldSaveState("description")?.status || "idle"} />
          </div>
        </div>

        {/* Rules */}
        <div style={fieldRow}>
          <div style={fieldFlex}>
            <TextArea
              id="exam-rules"
              labelText="考試規則"
              helperText="考生在進入考試前會看到這些規則"
              value={watch("rules")}
              onChange={(e) => handleTextChange("rules", e.target.value)}
              rows={3}
            />
          </div>
          <div style={indicatorOffset}>
            <FieldSaveIndicator status={getFieldSaveState("rules")?.status || "idle"} />
          </div>
        </div>

        {/* Start Time */}
        <div>
          <p style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginBottom: "0.5rem" }}>
            開始時間
          </p>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
            <DatePicker
              datePickerType="single"
              dateFormat="m/d/Y"
              value={startParsed.date}
              onChange={(dates: Date[]) => {
                if (dates[0]) {
                  const d = dates[0];
                  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                  handleDateTimeChange("startTime", dateStr, startParsed.time || "00:00");
                }
              }}
            >
              <DatePickerInput
                id="exam-start-date"
                labelText="日期"
                placeholder="mm/dd/yyyy"
                invalid={!!errors.startTime}
                invalidText={errors.startTime?.message}
              />
            </DatePicker>
            <TimePicker
              id="exam-start-time"
              labelText="時間"
              value={startParsed.time}
              onChange={(e) => {
                const timeVal = (e.target as HTMLInputElement).value;
                if (startParsed.date && timeVal) {
                  const current = watch("startTime");
                  const d = current ? new Date(current) : new Date();
                  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                  handleDateTimeChange("startTime", dateStr, timeVal);
                }
              }}
            />
            <div style={indicatorOffset}>
              <FieldSaveIndicator status={getFieldSaveState("startTime")?.status || "idle"} />
            </div>
          </div>
        </div>

        {/* End Time */}
        <div>
          <p style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginBottom: "0.5rem" }}>
            結束時間
          </p>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
            <DatePicker
              datePickerType="single"
              dateFormat="m/d/Y"
              value={endParsed.date}
              onChange={(dates: Date[]) => {
                if (dates[0]) {
                  const d = dates[0];
                  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                  handleDateTimeChange("endTime", dateStr, endParsed.time || "00:00");
                }
              }}
            >
              <DatePickerInput
                id="exam-end-date"
                labelText="日期"
                placeholder="mm/dd/yyyy"
                invalid={!!errors.endTime}
                invalidText={errors.endTime?.message}
              />
            </DatePicker>
            <TimePicker
              id="exam-end-time"
              labelText="時間"
              value={endParsed.time}
              onChange={(e) => {
                const timeVal = (e.target as HTMLInputElement).value;
                if (endParsed.date && timeVal) {
                  const current = watch("endTime");
                  const d = current ? new Date(current) : new Date();
                  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                  handleDateTimeChange("endTime", dateStr, timeVal);
                }
              }}
            />
            <div style={indicatorOffset}>
              <FieldSaveIndicator status={getFieldSaveState("endTime")?.status || "idle"} />
            </div>
          </div>
        </div>

        {/* Status + Visibility row */}
        <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
          <div style={fieldRow}>
            <div style={{ minWidth: "180px" }}>
              <Select
                id="exam-status"
                labelText="狀態"
                value={watch("status")}
                onChange={(e) => handleSelectChange("status", e.target.value)}
              >
                <SelectItem value="draft" text="草稿" />
                <SelectItem value="published" text="已發布" />
                <SelectItem value="archived" text="已封存" />
              </Select>
            </div>
            <div style={indicatorOffset}>
              <FieldSaveIndicator status={getFieldSaveState("status")?.status || "idle"} />
            </div>
          </div>

          <div style={fieldRow}>
            <div style={{ minWidth: "180px" }}>
              <Select
                id="exam-visibility"
                labelText="可見性"
                value={visibility}
                onChange={(e) => handleSelectChange("visibility", e.target.value)}
              >
                <SelectItem value="public" text="公開" />
                <SelectItem value="private" text="私人" />
              </Select>
            </div>
            <div style={indicatorOffset}>
              <FieldSaveIndicator status={getFieldSaveState("visibility")?.status || "idle"} />
            </div>
          </div>
        </div>

        {/* Password (conditional) */}
        {visibility === "private" && (
          <div style={fieldRow}>
            <div style={{ ...fieldFlex, maxWidth: "300px" }}>
              <TextInput
                id="exam-password"
                type="password"
                labelText="加入密碼"
                helperText="學生加入考試時需要輸入此密碼"
                value={watch("password")}
                onChange={(e) => handleTextChange("password", e.target.value)}
              />
            </div>
            <div style={indicatorOffset}>
              <FieldSaveIndicator status={getFieldSaveState("password")?.status || "idle"} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default ExamBasicInfoSection;
