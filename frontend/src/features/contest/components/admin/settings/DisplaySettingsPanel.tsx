import { Toggle } from "@carbon/react";
import {
  Section,
  ActionRow,
} from "@/features/contest/components/admin/AdminSettingsPanelLayout";
import type { ContestSettingsPanelProps } from "./ContestSettingsPanelProps";

export default function DisplaySettingsPanel({
  t,
  tc,
  form,
  getState,
  onRetry,
  onChange,
}: ContestSettingsPanelProps) {
  return (
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
  );
}
