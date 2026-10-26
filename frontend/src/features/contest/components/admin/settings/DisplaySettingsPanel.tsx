import { Select, SelectItem, Toggle } from "@carbon/react";
import { SectionSaveIndicator } from "@/features/contest/components/admin/AdminSettingsPanelLayout";
import { ActionRow, Section } from "@/shared/layout/SettingsPanel";
import type { ContestSettingsPanelProps } from "./contestSettingsPanel.types";

export default function DisplaySettingsPanel({
  t,
  contest,
  form,
  getState,
  onRetry,
  onChange,
}: ContestSettingsPanelProps) {
  return (
    <Section
      title={contest.contestType === "paper_exam" ? t("settings.paperOptions", "考卷設定") : t("settings.contestOptions", "競賽設定")}
      action={
        <SectionSaveIndicator
          fields={["scoreboardVisibleDuringContest", "expandQuestionNumbers"]}
          getState={getState}
          onRetry={onRetry}
        />
      }
    >
      {contest.contestType === "paper_exam" && (
        <ActionRow
          label={t("settings.questionNumbering", "題號")}
          labelId="settings-question-numbering-label"
          description={t("settings.questionNumberingHelp", "套用整份考卷；展開時子題各自連號，不展開時使用大題與子題編號。")}
        >
          <Select
            id="settings-question-numbering"
            labelText=""
            hideLabel
            aria-labelledby="settings-question-numbering-label"
            disabled={contest.questionEditLocked}
            value={form.expandQuestionNumbers ? "expanded" : "nested"}
            onChange={(event) => onChange("expandQuestionNumbers", event.target.value === "expanded")}
          >
            <SelectItem value="nested" text={t("settings.numberingNested", "不展開：1(a).、1(b).")}/>
            <SelectItem value="expanded" text={t("settings.numberingExpanded", "展開：1.、2.、3.")}/>
          </Select>
        </ActionRow>
      )}
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
