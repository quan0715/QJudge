import type { ChangeEvent } from "react";
import type { TFunction } from "i18next";
import {
  TextInput,
  Select,
  SelectItem,
  Toggle,
  NumberInput,
  DatePicker,
  DatePickerInput,
  TimePicker,
  TimePickerSelect,
} from "@carbon/react";

import type {
  ContestDetail,
  ContestStatus,
} from "@/core/entities/contest.entity";
import type { FieldSaveState } from "@/features/contest/components/admin/examEditor/hooks/useExamAutoSave";
import { MarkdownField } from "@/shared/ui/markdown/markdownEditor";
import {
  Section,
  ActionRow,
  FieldRow,
} from "@/features/contest/components/admin/AdminSettingsPanelLayout";

type TranslateFn = TFunction;

const STATUS_LABELS: Record<ContestStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

interface AdminContestSettingsFormSectionsProps {
  t: TranslateFn;
  tc: TranslateFn;
  contest: ContestDetail;
  form: Record<string, unknown>;
  startDateInput: string;
  endDateInput: string;
  startTimeInput: string;
  endTimeInput: string;
  startMeridiem: "AM" | "PM";
  endMeridiem: "AM" | "PM";
  getState: (field: string) => FieldSaveState | undefined;
  onRetry: (field: string) => void;
  onChange: (field: string, value: unknown) => void;
  onConfirmedChange: (field: string, value: unknown, message: string) => void;
  onStartDateChange: (dates: Date[]) => void;
  onEndDateChange: (dates: Date[]) => void;
  onStartTimeChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onEndTimeChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onStartMeridiemChange: (value: string) => void;
  onEndMeridiemChange: (value: string) => void;
}

const AdminContestSettingsFormSections = ({
  t,
  tc,
  contest,
  form,
  startDateInput,
  endDateInput,
  startTimeInput,
  endTimeInput,
  startMeridiem,
  endMeridiem,
  getState,
  onRetry,
  onChange,
  onConfirmedChange,
  onStartDateChange,
  onEndDateChange,
  onStartTimeChange,
  onEndTimeChange,
  onStartMeridiemChange,
  onEndMeridiemChange,
}: AdminContestSettingsFormSectionsProps) => {
  return (
    <>
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
            showPreview={false}
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
              value={startDateInput}
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
              value={endDateInput}
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

      <Section title="狀態與權限">
        <ActionRow
          label={t("settings.statusLabel")}
          description="Draft 狀態僅管理員可見；Published 後學生即可加入"
          saveState={getState("status")}
          onRetry={() => onRetry("status")}
        >
          <Select
            id="settings-status"
            labelText=""
            hideLabel
            value={(form.status as string) || "draft"}
            disabled={form.status === "archived" || !contest?.permissions?.canToggleStatus}
            style={{ minWidth: 160 }}
            onChange={(e) => {
              const next = e.target.value as ContestStatus;
              const current = form.status as ContestStatus;
              onConfirmedChange(
                "status",
                next,
                `確定將競賽狀態從「${STATUS_LABELS[current]}」改為「${STATUS_LABELS[next]}」？已發布的競賽會對學生可見。`,
              );
            }}
          >
            <SelectItem value="draft" text={tc("status.draft")} />
            <SelectItem value="published" text={tc("status.published")} />
            <SelectItem
              value="archived"
              text={tc("status.archived")}
              disabled={form.status !== "archived"}
            />
          </Select>
        </ActionRow>

        <ActionRow
          label={tc("form.visibility")}
          description="Private 競賽需要密碼才能加入"
          saveState={getState("visibility")}
          onRetry={() => onRetry("visibility")}
        >
          <Select
            id="settings-visibility"
            labelText=""
            hideLabel
            value={(form.visibility as string) || "public"}
            style={{ minWidth: 160 }}
            onChange={(e) => onChange("visibility", e.target.value)}
          >
            <SelectItem value="public" text={tc("status.public")} />
            <SelectItem value="private" text={tc("status.private")} />
          </Select>
        </ActionRow>

        {form.visibility === "private" && (
          <FieldRow
            label={t("settings.joinPassword")}
            description="學生加入時需輸入此密碼"
            saveState={getState("password")}
            onRetry={() => onRetry("password")}
          >
            <TextInput
              id="settings-password"
              labelText=""
              hideLabel
              type="password"
              value={(form.password as string) || ""}
              onChange={(e) => onChange("password", e.target.value)}
            />
          </FieldRow>
        )}
      </Section>

      <Section title="顯示設定">
        <ActionRow
          label={t("settings.showDuringContest")}
          description={t("settings.showDuringContestHelp")}
          saveState={getState("scoreboardVisibleDuringContest")}
          onRetry={() => onRetry("scoreboardVisibleDuringContest")}
        >
          <Toggle
            id="settings-scoreboard"
            labelText=""
            hideLabel
            labelA={tc("toggle.hide")}
            labelB={tc("toggle.show")}
            toggled={(form.scoreboardVisibleDuringContest as boolean) ?? false}
            onToggle={(checked) => onChange("scoreboardVisibleDuringContest", checked)}
          />
        </ActionRow>

        <ActionRow
          label={t("settings.anonymousMode")}
          description={t("settings.anonymousModeHelp")}
          saveState={getState("anonymousModeEnabled")}
          onRetry={() => onRetry("anonymousModeEnabled")}
        >
          <Toggle
            id="settings-anonymous"
            labelText=""
            hideLabel
            labelA={tc("toggle.off")}
            labelB={tc("toggle.on")}
            toggled={(form.anonymousModeEnabled as boolean) ?? false}
            onToggle={(checked) => onChange("anonymousModeEnabled", checked)}
          />
        </ActionRow>
      </Section>

      <Section title="作弊檢查">
        <ActionRow
          label={t("settings.enableExamMode")}
          description="啟用後將開啟全螢幕監控、作弊偵測與答案鎖定機制"
          saveState={getState("cheatDetectionEnabled")}
          onRetry={() => onRetry("cheatDetectionEnabled")}
        >
          <Toggle
            id="settings-exam-mode"
            labelText=""
            hideLabel
            labelA={tc("toggle.off")}
            labelB={tc("toggle.on")}
            toggled={(form.cheatDetectionEnabled as boolean) ?? false}
            onToggle={(checked) => {
              const msg = checked
                ? "開啟作弊檢查後將啟用作弊偵測和答案鎖定機制，確定開啟？"
                : "關閉作弊檢查將停用所有監控功能，確定關閉？";
              onConfirmedChange("cheatDetectionEnabled", checked, msg);
            }}
          />
        </ActionRow>

        {(form.cheatDetectionEnabled as boolean) && (
          <>
            <ActionRow
              label={t("settings.allowMultipleJoins")}
              description="允許同一學生多次加入考試（例如斷線重連）"
              saveState={getState("allowMultipleJoins")}
              onRetry={() => onRetry("allowMultipleJoins")}
            >
              <Toggle
                id="settings-multi-join"
                labelText=""
                hideLabel
                labelA={tc("toggle.forbid")}
                labelB={tc("toggle.allow")}
                toggled={(form.allowMultipleJoins as boolean) ?? false}
                onToggle={(checked) => onChange("allowMultipleJoins", checked)}
              />
            </ActionRow>

            <ActionRow
              label={t("settings.maxWarnings")}
              description="違規警告達到上限後自動鎖定該學生，0 表示立即鎖定"
              saveState={getState("maxCheatWarnings")}
              onRetry={() => onRetry("maxCheatWarnings")}
            >
              <NumberInput
                id="settings-max-warnings"
                label=""
                hideLabel
                min={0}
                max={10}
                value={(form.maxCheatWarnings as number) ?? 0}
                onChange={(_event, { value }) => onChange("maxCheatWarnings", Number(value))}
                style={{ maxWidth: 140 }}
              />
            </ActionRow>

            <ActionRow
              label={t("settings.allowAutoUnlock")}
              description="鎖定後經過指定時間自動解鎖，無需監考人員手動處理"
              saveState={getState("allowAutoUnlock")}
              onRetry={() => onRetry("allowAutoUnlock")}
            >
              <Toggle
                id="settings-auto-unlock"
                labelText=""
                hideLabel
                labelA={tc("toggle.forbid")}
                labelB={tc("toggle.allow")}
                toggled={(form.allowAutoUnlock as boolean) ?? false}
                onToggle={(checked) => onChange("allowAutoUnlock", checked)}
              />
            </ActionRow>

            {(form.allowAutoUnlock as boolean) && (
              <ActionRow
                label={t("settings.autoUnlockMinutes")}
                description={t("settings.autoUnlockHelperText")}
                saveState={getState("autoUnlockMinutes")}
                onRetry={() => onRetry("autoUnlockMinutes")}
              >
                <NumberInput
                  id="settings-unlock-mins"
                  label=""
                  hideLabel
                  min={1}
                  max={1440}
                  value={(form.autoUnlockMinutes as number) ?? 5}
                  onChange={(_event, { value }) => onChange("autoUnlockMinutes", Number(value))}
                  style={{ maxWidth: 140 }}
                />
              </ActionRow>
            )}
          </>
        )}
      </Section>
    </>
  );
};

export default AdminContestSettingsFormSections;
