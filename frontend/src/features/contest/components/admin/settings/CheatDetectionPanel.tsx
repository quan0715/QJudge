import { Toggle } from "@carbon/react";
import { SectionSaveIndicator } from "@/features/contest/components/admin/AdminSettingsPanelLayout";
import { ActionRow, Section } from "@/shared/layout/SettingsPanel";
import type { ContestSettingsPanelProps } from "./contestSettingsPanel.types";

export default function CheatDetectionPanel({
  t,
  form,
  getState,
  onRetry,
  onChange,
  onConfirmedChange,
}: ContestSettingsPanelProps) {
  const strictModeEnabled = (form.cheatDetectionEnabled as boolean) ?? false;

  return (
    <Section
      title={t("settings.examModeSettings", "防作弊監控設定")}
      action={
        <SectionSaveIndicator
          fields={["cheatDetectionEnabled", "webcamRequired"]}
          getState={getState}
          onRetry={onRetry}
        />
      }
    >
      <ActionRow
        label={t("settings.enableExamMode")}
        labelId="settings-exam-mode-label"
        description={t(
          "settings.enableExamModeDesc",
          "考生須使用可分享螢幕的電腦作答，並固定偵測全螢幕、多螢幕與滑鼠離開。"
        )}
      >
        <Toggle
          id="settings-exam-mode"
          aria-labelledby="settings-exam-mode-label"
          hideLabel
          size="sm"
          toggled={strictModeEnabled}
          onToggle={(checked) => {
            const msg = checked
              ? t(
                  "settings.confirmEnableExamMode",
                  "啟用後考生須使用可分享螢幕的電腦作答，確定啟用？"
                )
              : t("settings.confirmDisableExamMode", "關閉後將停用本場考試的防作弊監控，確定關閉？");
            onConfirmedChange("cheatDetectionEnabled", checked, msg);
          }}
        />
      </ActionRow>

      <ActionRow
        label={t("settings.anticheat.requireWebcam", "要求 Webcam")}
        labelId="settings-require-webcam-label"
        description={t(
          "settings.anticheat.requireWebcamDesc",
          "考生除了分享螢幕，也需開啟 Webcam。"
        )}
      >
        <Toggle
          id="settings-require-webcam"
          aria-labelledby="settings-require-webcam-label"
          hideLabel
          size="sm"
          toggled={(form.webcamRequired as boolean) ?? false}
          disabled={!strictModeEnabled}
          onToggle={(checked) => onChange("webcamRequired", checked)}
        />
      </ActionRow>
    </Section>
  );
}
