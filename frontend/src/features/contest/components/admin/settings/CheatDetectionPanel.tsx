import { Toggle, NumberInput } from "@carbon/react";
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
    <Section title="作弊檢查">
      <ActionRow
        label={t("settings.enableExamMode")}
        description="啟用後將開啟全螢幕監控、作弊偵測與答案鎖定機制"
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
              ? "開啟作弊檢查後將啟用作弊偵測和答案鎖定機制，確定開啟？"
              : "關閉作弊檢查將停用所有監控功能，確定關閉？";
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
              Access Policy
            </h5>

            <ActionRow
              label="允許桌機作答"
              description="Windows / macOS / Linux 桌面瀏覽器使用這套規則。"
              saveState={getState("anticheatDevicePolicy")}
              onRetry={() => onRetry("anticheatDevicePolicy")}
            >
              <Toggle
                id="settings-allow-desktop"
                labelText="允許桌機作答"
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
              label="允許平板作答"
              description="iPad / Android tablet 仍視為 tablet，即使外接鍵盤滑鼠也不會改成 desktop。"
              saveState={getState("anticheatDevicePolicy")}
              onRetry={() => onRetry("anticheatDevicePolicy")}
            >
              <Toggle
                id="settings-allow-tablet"
                labelText="允許平板作答"
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
              label="允許桌機多螢幕"
              description="關閉時，桌機會啟用多螢幕偵測並視為違規。"
              saveState={getState("anticheatDevicePolicy")}
              onRetry={() => onRetry("anticheatDevicePolicy")}
            >
              <Toggle
                id="settings-allow-desktop-multi-display"
                labelText="允許桌機多螢幕"
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
              description="允許學生在已提交或離開後重新進入考試，並接管原有的作答進度。"
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
              Evidence Policy
            </h5>

            <ActionRow
              label="啟用證據追蹤"
              description="桌機預設要求螢幕共享；平板預設要求 webcam。"
              saveState={getState("anticheatDevicePolicy")}
              onRetry={() => onRetry("anticheatDevicePolicy")}
            >
              <Toggle
                id="settings-evidence-enabled"
                labelText="啟用證據追蹤"
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
                  label="桌機主證據來源"
                  description="桌機固定以 screen share 為主來源；全螢幕與多螢幕規則也會跟著 desktop runtime 執行。"
                >
                  <span style={{ fontSize: "0.875rem", color: "var(--cds-text-primary)" }}>
                    {evidencePolicy.desktopScreenShare ? "Screen share" : "未啟用"}
                  </span>
                </FieldRow>

                <ActionRow
                  label="桌機輔助 webcam"
                  description="開啟後，desktop 會在 screen share 之外額外要求 webcam。"
                  saveState={getState("anticheatDevicePolicy")}
                  onRetry={() => onRetry("anticheatDevicePolicy")}
                >
                  <Toggle
                    id="settings-desktop-webcam-assist"
                    labelText="桌機輔助 webcam"
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
                  label="平板主證據來源"
                  description="平板不走 desktop 的 fullscreen / blur / tab hidden；進場以 PWA，執行期以 viewport integrity 為主。"
                >
                  <span style={{ fontSize: "0.875rem", color: "var(--cds-text-primary)" }}>
                    {evidencePolicy.tabletWebcam ? "Webcam" : "未啟用"}
                  </span>
                </FieldRow>

                <ActionRow
                  label="螢幕共享恢復時限"
                  description="螢幕共享中斷後，學生可重新分享的寬限秒數；前端 runtime 會直接依後端儲存值執行。"
                  saveState={getState("screenShareRecoveryGraceMs")}
                  onRetry={() => onRetry("screenShareRecoveryGraceMs")}
                >
                  <NumberInput
                    id="settings-screen-share-recovery-grace-seconds"
                    label=""
                    hideLabel
                    min={1}
                    max={300}
                    value={Math.max(
                      1,
                      Math.round(((form.screenShareRecoveryGraceMs as number) ?? 30_000) / 1000),
                    )}
                    onChange={(_event, { value }) =>
                      onChange(
                        "screenShareRecoveryGraceMs",
                        Math.max(1, Number(value || 30)) * 1000,
                      )
                    }
                    style={{ maxWidth: 140 }}
                  />
                </ActionRow>
              </div>
            )}
          </div>

          <div style={{ marginTop: "1.5rem", marginBottom: "2rem" }}>
            <h5
              style={{
                fontWeight: 600,
                color: "var(--cds-text-primary)",
                marginBottom: "0.75rem",
              }}
            >
              Penalty Policy
            </h5>

            <ActionRow
              label={t("settings.warningCooldown")}
              description="偵測到違規後警告視窗需強制停留的時間，逾時未確認將視為持續違規。"
              saveState={getState("warningTimeoutSeconds")}
              onRetry={() => onRetry("warningTimeoutSeconds")}
            >
              <NumberInput
                id="settings-warning-timeout-seconds"
                label=""
                hideLabel
                min={1}
                max={120}
                value={(form.warningTimeoutSeconds as number) ?? 20}
                onChange={(_event, { value }) =>
                  onChange("warningTimeoutSeconds", Math.max(1, Number(value || 20)))
                }
                style={{ maxWidth: 140 }}
              />
            </ActionRow>

            <ActionRow
              label={t("settings.maxWarnings")}
              description="違規警告達到上限後自動鎖定該學生，0 表示立即鎖定。"
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
              description="鎖定後經過指定時間自動解鎖，無需監考人員手動處理。"
              saveState={getState("allowAutoUnlock")}
              onRetry={() => onRetry("allowAutoUnlock")}
            >
              <Toggle
                id="settings-auto-unlock"
                labelText="自動解鎖"
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
          </div>
        </>
      )}
    </Section>
  );
}
