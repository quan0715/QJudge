import type { ChangeEvent } from "react";
import type { TFunction } from "i18next";
import {
  Button,
} from "@carbon/react";

import type { ContestDetail } from "@/core/entities/contest.entity";
import type { FieldSaveState } from "@/features/contest/components/admin/examEditor/hooks/useExamAutoSave";
import {
  TITLE_STYLE,
  DESC_STYLE,
  Section,
} from "@/features/contest/components/admin/AdminSettingsPanelLayout";
import AdminContestSettingsFormSections from "@/features/contest/components/admin/AdminContestSettingsFormSections";
import { settingsPanelStyles as s } from "@/shared/layout/SettingsPanel";

type TranslateFn = TFunction;

interface DangerActionProps {
  title: string;
  description: string;
  buttonLabel: string;
  buttonKind?: "danger" | "danger--ghost" | "secondary";
  disabled?: boolean;
  onClick: () => void;
}

const DangerAction = ({
  title,
  description,
  buttonLabel,
  buttonKind = "danger--ghost",
  disabled,
  onClick,
}: DangerActionProps) => (
  <div className={s.dangerRow}>
    <div className={s.actionRowContent}>
      <div style={TITLE_STYLE}>{title}</div>
      <div style={DESC_STYLE}>{description}</div>
    </div>
    <Button
      kind={buttonKind}
      size="sm"
      disabled={disabled}
      onClick={onClick}
      style={{ flexShrink: 0 }}
    >
      {buttonLabel}
    </Button>
  </div>
);

interface AdminContestSettingsContentProps {
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
  onArchive: () => void;
  onDelete: () => void;
}

const AdminContestSettingsContent = ({
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
  onArchive,
  onDelete,
}: AdminContestSettingsContentProps) => (
  <>
    <AdminContestSettingsFormSections
      t={t}
      tc={tc}
      contest={contest}
      form={form}
      startDateInput={startDateInput}
      endDateInput={endDateInput}
      startTimeInput={startTimeInput}
      endTimeInput={endTimeInput}
      startMeridiem={startMeridiem}
      endMeridiem={endMeridiem}
      getState={getState}
      onRetry={onRetry}
      onChange={onChange}
      onConfirmedChange={onConfirmedChange}
      onStartDateChange={onStartDateChange}
      onEndDateChange={onEndDateChange}
      onStartTimeChange={onStartTimeChange}
      onEndTimeChange={onEndTimeChange}
      onStartMeridiemChange={onStartMeridiemChange}
      onEndMeridiemChange={onEndMeridiemChange}
    />

    <Section title="Danger Zone">
      <DangerAction
        title={t("settings.archiveContest")}
        description={t("settings.archiveDesc")}
        buttonLabel={
          contest.status === "archived"
            ? t("settings.alreadyArchived")
            : tc("button.archive")
        }
        disabled={contest.status === "archived" || !contest.permissions?.canToggleStatus}
        onClick={onArchive}
      />

      <DangerAction
        title={t("settings.deleteContest")}
        description={t("settings.deleteDesc")}
        buttonLabel={tc("button.delete")}
        buttonKind="danger"
        disabled={!contest.permissions?.canDeleteContest}
        onClick={onDelete}
      />
    </Section>
  </>
);

export default AdminContestSettingsContent;
