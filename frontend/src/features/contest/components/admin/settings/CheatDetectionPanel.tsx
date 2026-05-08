import { Toggle } from "@carbon/react";
import {
  Section,
  ActionRow,
  FieldRow,
} from "@/features/contest/components/admin/AdminSettingsPanelLayout";
import type { ContestSettingsPanelProps } from "./ContestSettingsPanelProps";
import {
  getAccessPolicyView,
  getEvidencePolicyView,
  updateAllowedDevice,
  updateDesktopMultiDisplayAllowance,
  updateEvidenceTracking,
  updateDesktopWebcamAssist,
} from "./anticheatPolicyModel";

export default function CheatDetectionPanel({
  t,
  tc,
  form,
  getState,
  onRetry,
  onChange,
  onConfirmedChange,
}: ContestSettingsPanelProps) {
  const accessPolicy = getAccessPolicyView(form.anticheatDevicePolicy);
  const evidencePolicy = getEvidencePolicyView(form.anticheatDevicePolicy);

  const pushPolicyChange = (nextPolicy: unknown) => {
    onChange("anticheatDevicePolicy", nextPolicy);
  };

  return (
    <Section title={t("settings.examModeSettings", "防作弊監控設定")}>
      <ActionRow
        label={t("settings.enableExamMode")}
        description={t(
          "settings.enableExamModeDesc",
          "啟用後會依裝置政策套用考前檢查、監考來源與異常事件記錄。"
        )}
        saveState={getState("cheatDetectionEnabled")}
        onRetry={() => onRetry("cheatDetectionEnabled")}
      >
        <Toggle
          id="settings-exam-mode"
          labelText="啟用作弊檢查"
          hideLabel
          labelA={tc("toggle.off")}
          labelB={tc("toggle.on")}
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

      {(form.cheatDetectionEnabled as boolean) && (
        <>
          <div style={{ marginTop: "1.5rem", marginBottom: "2rem" }}>
            <h5
              style={{
                fontWeight: 600,
                color: "var(--cds-text-primary)",
                marginBottom: "0.75rem",
              }}
            >
              {t("settings.anticheat.accessPolicy", "Access Policy")}
            </h5>

            <ActionRow
              label={t("settings.anticheat.allowDesktop", "允許桌機作答")}
              description={t(
                "settings.anticheat.allowDesktopDesc",
                "Windows / macOS / Linux 桌面瀏覽器使用這套規則。"
              )}
              saveState={getState("anticheatDevicePolicy")}
              onRetry={() => onRetry("anticheatDevicePolicy")}
            >
              <Toggle
                id="settings-allow-desktop"
                labelText={t("settings.anticheat.allowDesktop", "允許桌機作答")}
                hideLabel
                labelA={tc("toggle.off")}
                labelB={tc("toggle.on")}
                toggled={accessPolicy.allowDesktop}
                onToggle={(checked) =>
                  pushPolicyChange(
                    updateAllowedDevice(form.anticheatDevicePolicy, "desktop", checked),
                  )
                }
                size="sm"
              />
            </ActionRow>

            <ActionRow
              label={t("settings.anticheat.allowTablet", "允許平板作答")}
              description={t(
                "settings.anticheat.allowTabletDesc",
                "iPad / Android tablet 仍視為 tablet，即使外接鍵盤滑鼠也不會改成 desktop。"
              )}
              saveState={getState("anticheatDevicePolicy")}
              onRetry={() => onRetry("anticheatDevicePolicy")}
            >
              <Toggle
                id="settings-allow-tablet"
                labelText={t("settings.anticheat.allowTablet", "允許平板作答")}
                hideLabel
                labelA={tc("toggle.off")}
                labelB={tc("toggle.on")}
                toggled={accessPolicy.allowTablet}
                onToggle={(checked) =>
                  pushPolicyChange(
                    updateAllowedDevice(form.anticheatDevicePolicy, "tablet", checked),
                  )
                }
                size="sm"
              />
            </ActionRow>

            <ActionRow
              label={t("settings.anticheat.allowDesktopMultiDisplay", "允許桌機多螢幕")}
              description={t(
                "settings.anticheat.allowDesktopMultiDisplayDesc",
                "關閉時，桌機會啟用多螢幕偵測並記錄為異常事件。"
              )}
              saveState={getState("anticheatDevicePolicy")}
              onRetry={() => onRetry("anticheatDevicePolicy")}
            >
              <Toggle
                id="settings-allow-desktop-multi-display"
                labelText={t("settings.anticheat.allowDesktopMultiDisplay", "允許桌機多螢幕")}
                hideLabel
                labelA={tc("toggle.forbid")}
                labelB={tc("toggle.allow")}
                toggled={accessPolicy.allowDesktopMultiDisplay}
                onToggle={(checked) =>
                  pushPolicyChange(
                    updateDesktopMultiDisplayAllowance(form.anticheatDevicePolicy, checked),
                  )
                }
                size="sm"
                disabled={!accessPolicy.allowDesktop}
              />
            </ActionRow>

            <ActionRow
              label={t("settings.allowMultipleJoins")}
              description={t(
                "settings.allowMultipleJoinsDesc",
                "允許學生在離開後重新進入考試，並接管原有的作答進度。"
              )}
              saveState={getState("allowMultipleJoins")}
              onRetry={() => onRetry("allowMultipleJoins")}
            >
              <Toggle
                id="settings-allow-multiple-joins"
                labelText={t("settings.allowMultipleJoins")}
                hideLabel
                labelA={tc("toggle.forbid")}
                labelB={tc("toggle.allow")}
                toggled={(form.allowMultipleJoins as boolean) ?? false}
                onToggle={(checked) => onChange("allowMultipleJoins", checked)}
                size="sm"
              />
            </ActionRow>
          </div>

          <div style={{ marginTop: "1.5rem", marginBottom: "2rem" }}>
            <h5
              style={{
                fontWeight: 600,
                color: "var(--cds-text-primary)",
                marginBottom: "0.75rem",
              }}
            >
              {t("settings.anticheat.evidencePolicy", "Evidence Policy")}
            </h5>

            <ActionRow
              label={t("settings.anticheat.enableEvidenceTracking", "啟用證據追蹤")}
              description={t(
                "settings.anticheat.enableEvidenceTrackingDesc",
                "桌機預設要求螢幕分享；平板預設要求 Webcam。"
              )}
              saveState={getState("anticheatDevicePolicy")}
              onRetry={() => onRetry("anticheatDevicePolicy")}
            >
              <Toggle
                id="settings-evidence-enabled"
                labelText={t("settings.anticheat.enableEvidenceTracking", "啟用證據追蹤")}
                hideLabel
                labelA={tc("toggle.off")}
                labelB={tc("toggle.on")}
                toggled={evidencePolicy.enabled}
                onToggle={(checked) =>
                  pushPolicyChange(updateEvidenceTracking(form.anticheatDevicePolicy, checked))
                }
                size="sm"
              />
            </ActionRow>

            {evidencePolicy.enabled && (
              <div
                style={{
                  marginTop: "1rem",
                  paddingLeft: "1rem",
                  borderLeft: "2px solid var(--cds-border-subtle)",
                }}
              >
                <FieldRow
                  label={t("settings.anticheat.desktopPrimaryEvidence", "桌機主證據來源")}
                  description={t(
                    "settings.anticheat.desktopPrimaryEvidenceDesc",
                    "桌機以螢幕分享為主來源；全螢幕與多螢幕規則會依桌機監控流程執行。"
                  )}
                >
                  <span style={{ fontSize: "0.875rem", color: "var(--cds-text-primary)" }}>
                    {evidencePolicy.desktopScreenShare
                      ? t("settings.anticheat.sourceScreenShare", "Screen share")
                      : t("common:disabled", "未啟用")}
                  </span>
                </FieldRow>

                <ActionRow
                  label={t("settings.anticheat.desktopWebcamAssist", "桌機輔助 Webcam")}
                  description={t(
                    "settings.anticheat.desktopWebcamAssistDesc",
                    "開啟後，桌機會在螢幕分享之外額外要求 Webcam。"
                  )}
                  saveState={getState("anticheatDevicePolicy")}
                  onRetry={() => onRetry("anticheatDevicePolicy")}
                >
                  <Toggle
                    id="settings-desktop-webcam-assist"
                    labelText={t("settings.anticheat.desktopWebcamAssist", "桌機輔助 Webcam")}
                    hideLabel
                    labelA={tc("toggle.off")}
                    labelB={tc("toggle.on")}
                    toggled={evidencePolicy.desktopWebcamAssist}
                    onToggle={(checked) =>
                      pushPolicyChange(
                        updateDesktopWebcamAssist(form.anticheatDevicePolicy, checked),
                      )
                    }
                    size="sm"
                    disabled={!accessPolicy.allowDesktop}
                  />
                </ActionRow>

                <FieldRow
                  label={t("settings.anticheat.tabletPrimaryEvidence", "平板主證據來源")}
                  description={t(
                    "settings.anticheat.tabletPrimaryEvidenceDesc",
                    "平板不使用 desktop 的全螢幕、失焦與分頁隱藏規則；進場以 PWA，執行期以視窗完整性檢查為主。"
                  )}
                >
                  <span style={{ fontSize: "0.875rem", color: "var(--cds-text-primary)" }}>
                    {evidencePolicy.tabletWebcam
                      ? t("settings.anticheat.sourceWebcam", "Webcam")
                      : t("common:disabled", "未啟用")}
                  </span>
                </FieldRow>
              </div>
            )}
          </div>

        </>
      )}
    </Section>
  );
}
