import {
  Select,
  SelectItem,
  Toggle,
  Button,
} from "@carbon/react";
import type { ContestStatus } from "@/core/entities/contest.entity";
import {
  TITLE_STYLE,
  DESC_STYLE,
  Section,
  ActionRow,
} from "@/features/contest/components/admin/AdminSettingsPanelLayout";
import { settingsPanelStyles as s } from "@/shared/layout/SettingsPanel";
import type { ContestSettingsPanelProps } from "./ContestSettingsPanelProps";

const STATUS_LABELS: Record<ContestStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

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

interface AccessSettingsPanelProps extends ContestSettingsPanelProps {
  onArchive: () => void;
  onDelete: () => void;
}

export default function AccessSettingsPanel({
  t,
  tc,
  contest,
  form,
  getState,
  onRetry,
  onChange,
  onConfirmedChange,
  onArchive,
  onDelete,
}: AccessSettingsPanelProps) {
  return (
    <>
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
          label="QR 簽到簽退"
          description="啟用後學生需先在競賽主頁掃描 QR Code 並提交現場照片，完成簽到後才能開始考試。"
          saveState={getState("attendanceCheckEnabled")}
          onRetry={() => onRetry("attendanceCheckEnabled")}
        >
          <Toggle
            id="settings-attendance-check"
            labelText=""
            hideLabel
            labelA={tc("toggle.off")}
            labelB={tc("toggle.on")}
            toggled={!!form.attendanceCheckEnabled}
            onToggle={(checked) => onChange("attendanceCheckEnabled", checked)}
          />
        </ActionRow>

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
      </Section>

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
}
