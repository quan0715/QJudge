import { useState } from "react";
import { InlineNotification, Toggle } from "@carbon/react";
import { SectionSaveIndicator } from "@/features/contest/components/admin/AdminSettingsPanelLayout";
import { ActionRow, Section } from "@/shared/layout/SettingsPanel";
import type { ContestSettingsPanelProps } from "./contestSettingsPanel.types";
import {
  getAccessPolicyView,
  getEvidencePolicyView,
  updateAllowedDevice,
  updateDesktopMultiDisplayAllowance,
  updateEvidenceSource,
} from "./anticheatPolicyModel";

type PolicySection = "access" | "evidence";

export default function CheatDetectionPanel({
  t,
  form,
  getState,
  onRetry,
  onChange,
  onConfirmedChange,
}: ContestSettingsPanelProps) {
  const accessPolicy = getAccessPolicyView(form.anticheatDevicePolicy);
  const evidencePolicy = getEvidencePolicyView(form.anticheatDevicePolicy);
  // Both policy sections write the same field, so its save state belongs to
  // whichever section the teacher last touched.
  const [editedSection, setEditedSection] = useState<PolicySection>("access");

  const pushPolicyChange = (section: PolicySection, nextPolicy: unknown) => {
    setEditedSection(section);
    onChange("anticheatDevicePolicy", nextPolicy);
  };

  const policySaveIndicator = (section: PolicySection) =>
    editedSection === section ? (
      <SectionSaveIndicator
        fields={["anticheatDevicePolicy"]}
        getState={getState}
        onRetry={onRetry}
      />
    ) : undefined;

  const webcamDescription =
    evidencePolicy.webcamOnlyOn === "tablet"
      ? t("settings.anticheat.webcamOnlyTabletDesc", "目前只有平板要求 Webcam；切換後會同時套用到桌機與平板。")
      : evidencePolicy.webcamOnlyOn === "desktop"
        ? t("settings.anticheat.webcamOnlyDesktopDesc", "目前只有桌機要求 Webcam；切換後會同時套用到桌機與平板。")
        : t("settings.anticheat.enableWebcamDesc", "桌機與平板考生都需開啟 Webcam。");

  return (
    <>
      <Section
        title={t("settings.examModeSettings", "防作弊監控設定")}
        action={
          <SectionSaveIndicator
            fields={["cheatDetectionEnabled"]}
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
            "啟用後會依裝置政策套用考前檢查、監考來源與異常事件記錄。"
          )}
        >
          <Toggle
            id="settings-exam-mode"
            aria-labelledby="settings-exam-mode-label"
            hideLabel
            size="sm"
            toggled={(form.cheatDetectionEnabled as boolean) ?? false}
            onToggle={(checked) => {
              const msg = checked
                ? t(
                    "settings.confirmEnableExamMode",
                    "啟用後將依裝置政策套用考前檢查、監考來源與異常事件記錄，確定啟用？"
                  )
                : t("settings.confirmDisableExamMode", "關閉後將停用本場考試的防作弊監控，確定關閉？");
              onConfirmedChange("cheatDetectionEnabled", checked, msg);
            }}
          />
        </ActionRow>
      </Section>

      {(form.cheatDetectionEnabled as boolean) && (
        <>
          <Section
            title={t("settings.anticheat.accessPolicy", "Access Policy")}
            action={policySaveIndicator("access")}
          >
            <ActionRow
              label={t("settings.anticheat.allowDesktop", "允許桌機作答")}
              labelId="settings-allow-desktop-label"
              description={t(
                "settings.anticheat.allowDesktopDesc",
                "Windows / macOS / Linux 桌面瀏覽器使用這套規則。"
              )}
            >
              <Toggle
                id="settings-allow-desktop"
                aria-labelledby="settings-allow-desktop-label"
                hideLabel
                size="sm"
                toggled={accessPolicy.allowDesktop}
                onToggle={(checked) =>
                  pushPolicyChange(
                    "access",
                    updateAllowedDevice(form.anticheatDevicePolicy, "desktop", checked),
                  )
                }
              />
            </ActionRow>

            <ActionRow
              label={t("settings.anticheat.allowTablet", "允許平板作答")}
              labelId="settings-allow-tablet-label"
              description={t(
                "settings.anticheat.allowTabletDesc",
                "iPad / Android tablet 仍視為 tablet，即使外接鍵盤滑鼠也不會改成 desktop。"
              )}
            >
              <Toggle
                id="settings-allow-tablet"
                aria-labelledby="settings-allow-tablet-label"
                hideLabel
                size="sm"
                toggled={accessPolicy.allowTablet}
                onToggle={(checked) =>
                  pushPolicyChange(
                    "access",
                    updateAllowedDevice(form.anticheatDevicePolicy, "tablet", checked),
                  )
                }
              />
            </ActionRow>

            <ActionRow
              label={t("settings.anticheat.allowDesktopMultiDisplay", "允許桌機多螢幕")}
              labelId="settings-allow-desktop-multi-display-label"
              description={t(
                "settings.anticheat.allowDesktopMultiDisplayDesc",
                "關閉時，桌機會啟用多螢幕偵測並記錄為異常事件。"
              )}
            >
              <Toggle
                id="settings-allow-desktop-multi-display"
                aria-labelledby="settings-allow-desktop-multi-display-label"
                hideLabel
                size="sm"
                toggled={accessPolicy.allowDesktopMultiDisplay}
                disabled={!accessPolicy.allowDesktop}
                onToggle={(checked) =>
                  pushPolicyChange(
                    "access",
                    updateDesktopMultiDisplayAllowance(form.anticheatDevicePolicy, checked),
                  )
                }
              />
            </ActionRow>
          </Section>

          <Section
            title={t("settings.anticheat.evidencePolicy", "Evidence Policy")}
            action={policySaveIndicator("evidence")}
          >
            <ActionRow
              label={t("settings.anticheat.enableScreenShare", "啟用螢幕分享")}
              labelId="settings-evidence-screen-share-label"
              description={t(
                "settings.anticheat.enableScreenShareDesc",
                "桌機考生需分享整個螢幕作為作答證據。"
              )}
            >
              <Toggle
                id="settings-evidence-screen-share"
                aria-labelledby="settings-evidence-screen-share-label"
                hideLabel
                size="sm"
                toggled={evidencePolicy.screenShare}
                disabled={!accessPolicy.allowDesktop}
                onToggle={(checked) =>
                  pushPolicyChange(
                    "evidence",
                    updateEvidenceSource(form.anticheatDevicePolicy, "screenShare", checked),
                  )
                }
              />
            </ActionRow>

            <ActionRow
              label={t("settings.anticheat.enableWebcam", "啟用 Webcam")}
              labelId="settings-evidence-webcam-label"
              description={webcamDescription}
            >
              <Toggle
                id="settings-evidence-webcam"
                aria-labelledby="settings-evidence-webcam-label"
                hideLabel
                size="sm"
                toggled={evidencePolicy.webcam}
                onToggle={(checked) =>
                  pushPolicyChange(
                    "evidence",
                    updateEvidenceSource(form.anticheatDevicePolicy, "webcam", checked),
                  )
                }
              />
            </ActionRow>

            {evidencePolicy.tabletAdvisory && (
              <InlineNotification
                kind={evidencePolicy.tabletAdvisory === "noEvidence" ? "warning" : "info"}
                lowContrast
                hideCloseButton
                title={t(
                  "settings.anticheat.tabletScreenShareUnsupported",
                  "平板暫時無法使用螢幕分享",
                )}
                subtitle={
                  evidencePolicy.tabletAdvisory === "noEvidence"
                    ? t(
                        "settings.anticheat.tabletNoEvidenceHint",
                        "平板考生目前沒有任何證據來源，建議開啟 Webcam。",
                      )
                    : t(
                        "settings.anticheat.tabletWebcamOnlyHint",
                        "平板考生只會以 Webcam 作為作答證據。",
                      )
                }
              />
            )}
          </Section>
        </>
      )}
    </>
  );
}
