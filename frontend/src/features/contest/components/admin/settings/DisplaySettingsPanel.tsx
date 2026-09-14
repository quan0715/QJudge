import { Toggle } from "@carbon/react";
import { SectionSaveIndicator } from "@/features/contest/components/admin/AdminSettingsPanelLayout";
import { ActionRow, Section } from "@/shared/layout/SettingsPanel";
import type { ContestSettingsPanelProps } from "./contestSettingsPanel.types";

export default function DisplaySettingsPanel({
  t,
  form,
  getState,
  onRetry,
  onChange,
}: ContestSettingsPanelProps) {
  return (
    <Section
      title={t("settings.contestOptions", "競賽設定")}
      action={
        <SectionSaveIndicator
          fields={["scoreboardVisibleDuringContest"]}
          getState={getState}
          onRetry={onRetry}
        />
      }
    >
      <ActionRow
        label={t("settings.showDuringContest")}
        labelId="settings-scoreboard-label"
        description={t("settings.showDuringContestHelp")}
      >
        <Toggle
          id="settings-scoreboard"
          aria-labelledby="settings-scoreboard-label"
          hideLabel
          toggled={(form.scoreboardVisibleDuringContest as boolean) ?? false}
          onToggle={(checked) => onChange("scoreboardVisibleDuringContest", checked)}
        />
      </ActionRow>
    </Section>
  );
}
