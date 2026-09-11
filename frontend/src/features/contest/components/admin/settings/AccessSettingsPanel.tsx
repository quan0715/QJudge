import {
  Select,
  SelectItem,
  Toggle,
  Button,
} from "@carbon/react";
import type { ContestStatus } from "@/core/entities/contest.entity";
import { SectionSaveIndicator } from "@/features/contest/components/admin/AdminSettingsPanelLayout";
import {
  ActionRow,
  DESC_STYLE,
  Section,
  TITLE_STYLE,
  settingsPanelStyles as s,
} from "@/shared/layout/SettingsPanel";
import type { ContestSettingsPanelProps } from "./contestSettingsPanel.types";

const SAVE_FIELDS = [
  "status",
  "attendanceCheckEnabled",
  "attendancePhotoPolicy",
  "allowMultipleJoins",
] as const;

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
      <Section
        title={t("settings.accessControl", "存取控制與權限")}
        action={<SectionSaveIndicator fields={SAVE_FIELDS} getState={getState} onRetry={onRetry} />}
      >
        <ActionRow
          label={t("settings.statusLabel")}
          description="Draft 狀態僅管理員可見；Published 後學生即可加入"
        >
          <Select
            id="settings-status"
            labelText={t("settings.statusLabel")}
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
          label={t("settings.attendanceCheck.label", "QR 簽到簽退")}
          labelId="settings-attendance-check-label"
          description={t(
            "settings.attendanceCheck.description",
            "啟用後學生需先在競賽主頁掃描 QR Code 並提交現場照片，完成簽到後才能開始考試。",
          )}
        >
          <Toggle
            id="settings-attendance-check"
            aria-labelledby="settings-attendance-check-label"
            hideLabel
            toggled={!!form.attendanceCheckEnabled}
            onToggle={(checked) => onChange("attendanceCheckEnabled", checked)}
          />
        </ActionRow>

        <ActionRow
          label={t("settings.attendancePhotoPolicy.label", "簽到佐證照片")}
          description={t(
            "settings.attendancePhotoPolicy.description",
            "可要求學生拍攝現場環境，或現場環境與本人到場照片各一張。",
          )}
        >
          <Select
            id="settings-attendance-photo-policy"
            labelText={t("settings.attendancePhotoPolicy.label", "簽到佐證照片")}
            hideLabel
            value={(form.attendancePhotoPolicy as string) || "room"}
            disabled={!form.attendanceCheckEnabled}
            style={{ minWidth: 220 }}
            onChange={(event) => onChange("attendancePhotoPolicy", event.target.value)}
          >
            <SelectItem
              value="room"
              text={t("settings.attendancePhotoPolicy.room", "後鏡頭現場照片")}
            />
            <SelectItem
              value="room_and_selfie"
              text={t(
                "settings.attendancePhotoPolicy.roomAndSelfie",
                "前鏡頭本人 + 後鏡頭現場",
              )}
            />
          </Select>
        </ActionRow>

        <ActionRow
          label={t("settings.allowMultipleJoins")}
          labelId="settings-multi-join-label"
          description={t(
            "settings.allowMultipleJoinsDesc",
            "允許學生在離開後重新進入考試，並接管原有的作答進度。",
          )}
        >
          <Toggle
            id="settings-multi-join"
            aria-labelledby="settings-multi-join-label"
            hideLabel
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
