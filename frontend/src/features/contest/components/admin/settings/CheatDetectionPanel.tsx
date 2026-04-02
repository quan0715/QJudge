import { useRef, useEffect } from "react";
import { Toggle, NumberInput } from "@carbon/react";
import type { ContestAnticheatDevicePolicy } from "@/core/entities/contest.entity";
import { sanitizeAnticheatPolicy } from "./anticheatPolicyUtils";
import {
  Section,
  ActionRow,
  FieldRow,
} from "@/features/contest/components/admin/AdminSettingsPanelLayout";
import type { ContestSettingsPanelProps } from "./ContestSettingsPanelProps";

export default function CheatDetectionPanel({
  t,
  tc,
  form,
  getState,
  onRetry,
  onChange,
  onConfirmedChange,
}: ContestSettingsPanelProps) {
  const anticheatPolicy = sanitizeAnticheatPolicy(form.anticheatDevicePolicy);

  const policyRef = useRef(anticheatPolicy);
  useEffect(() => {
    policyRef.current = anticheatPolicy;
  }, [anticheatPolicy]);

  const updateDevicePolicy = (mutator: (next: ContestAnticheatDevicePolicy) => void) => {
    try {
      const next = JSON.parse(JSON.stringify(policyRef.current)) as ContestAnticheatDevicePolicy;
      mutator(next);

      if (next.desktop?.detectors) {
        next.desktop.detectors.pwaMode = false;
        next.desktop.detectors.viewportIntegrity = false;
      }
      if (next.tablet?.detectors) {
        next.tablet.detectors.fullscreen = false;
        next.tablet.detectors.multiDisplay = false;
      }

      policyRef.current = next;
      onChange("anticheatDevicePolicy", next);
    } catch (e) {
      console.error("Failed to update anticheat policy:", e);
    }
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
          labelText=""
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
          <ActionRow
            label={t("settings.warningCooldown")}
            description="偵測到違規後警告視窗需強制停留的時間，逾時未確認將視為持續違規"
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
            label="螢幕共享恢復時限"
            description="螢幕共享中斷後，學生可重新分享的寬限秒數；前端 runtime 會直接依後端儲存值執行"
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

          {(["desktop", "tablet"] as const).map((deviceKey) => {
            const deviceLabel = deviceKey === "desktop" ? "Desktop / Laptop" : "Tablet / iPad";
            const devicePolicy = anticheatPolicy[deviceKey];
            const isEnabled = devicePolicy.enabled;

            return (
              <div key={deviceKey} style={{ marginTop: "1.5rem", marginBottom: "2rem" }}>
                <div
                  style={{
                    borderBottom: "1px solid var(--cds-border-subtle)",
                    paddingBottom: "0.5rem",
                    marginBottom: "1rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                  }}
                >
                  <h5 style={{ fontWeight: 600, color: "var(--cds-text-primary)" }}>
                    {t(`settings.anticheat.${deviceKey}Label` as any, deviceLabel)}
                  </h5>
                </div>

                <ActionRow
                  label="裝置啟用"
                  description={
                    isEnabled
                      ? t("settings.anticheat.enabledDesc", { device: deviceLabel })
                      : t("settings.anticheat.disabledDesc", { device: deviceLabel })
                  }
                  saveState={getState("anticheatDevicePolicy")}
                  onRetry={() => onRetry("anticheatDevicePolicy")}
                >
                  <Toggle
                    id={`settings-${deviceKey}-enabled`}
                    labelText=""
                    hideLabel
                    labelA={tc("toggle.off")}
                    labelB={tc("toggle.on")}
                    toggled={isEnabled}
                    onToggle={(checked) =>
                      updateDevicePolicy((next) => {
                        next[deviceKey].enabled = checked;
                      })
                    }
                    size="sm"
                  />
                </ActionRow>

                {isEnabled && (
                  <div style={{ marginTop: "1rem", paddingLeft: "1rem", borderLeft: "2px solid var(--cds-border-subtle)" }}>
                    <p style={{
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "var(--cds-text-secondary)",
                      marginBottom: "1rem",
                      marginTop: "1.5rem",
                      textTransform: "uppercase",
                    }}>
                      {t("settings.anticheat.monitoringSources")}
                    </p>

                    {(["screenShare", "webcam"] as const).map((sourceKey) => {
                      const sourceLabel = t(`settings.anticheat.${sourceKey}` as any, sourceKey === "screenShare" ? "螢幕監控" : "視訊監控");
                      const sourcePolicy = devicePolicy.sources[sourceKey];
                      return (
                        <div key={`${deviceKey}-${sourceKey}`} style={{ marginBottom: "1rem" }}>
                          <FieldRow
                            label={sourceLabel}
                            description={t(`settings.anticheat.${sourceKey}Desc` as any, "")}
                          >
                            <div style={{ display: "flex", gap: "1.5rem", alignItems: "center", flexWrap: "wrap" }}>
                              <Toggle
                                id={`settings-${deviceKey}-${sourceKey}-enabled`}
                                labelText={t("settings.anticheat.enableMonitoring")}
                                toggled={sourcePolicy.enabled}
                                onToggle={(checked) =>
                                  updateDevicePolicy((next) => {
                                    next[deviceKey].sources[sourceKey].enabled = checked;
                                  })
                                }
                                size="sm"
                              />
                              <div style={{ width: "120px" }}>
                                <NumberInput
                                  id={`settings-${deviceKey}-${sourceKey}-interval`}
                                  label={t("settings.anticheat.captureInterval")}
                                  min={1}
                                  max={60}
                                  value={sourcePolicy.captureIntervalSeconds}
                                  onChange={(_event, { value }) =>
                                    updateDevicePolicy((next) => {
                                      next[deviceKey].sources[sourceKey].captureIntervalSeconds = Math.max(
                                        1,
                                        Number(value || 1),
                                      );
                                    })
                                  }
                                  size="sm"
                                  disabled={!sourcePolicy.enabled}
                                />
                              </div>
                            </div>
                          </FieldRow>
                        </div>
                      );
                    })}

                    <p style={{
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "var(--cds-text-secondary)",
                      marginBottom: "1rem",
                      marginTop: "2rem",
                      textTransform: "uppercase",
                    }}>
                      {t("settings.anticheat.securityDetectors")}
                    </p>

                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "1.5rem 2.5rem",
                      paddingBottom: "1rem",
                    }}>
                      {(
                        deviceKey === "desktop"
                          ? ([
                              ["fullscreen", "全螢幕監控"],
                              ["focus", "焦點偵測"],
                              ["tabVisibility", "分頁切換偵測"],
                              ["multiDisplay", "多螢幕偵測"],
                              ["mouseLeave", "滑鼠追蹤"],
                            ] as const)
                          : ([
                              ["pwaMode", "PWA 模式"],
                              ["focus", "焦點偵測"],
                              ["tabVisibility", "分頁切換偵測"],
                              ["mouseLeave", "滑鼠追蹤"],
                              ["viewportIntegrity", "視窗完整性"],
                            ] as const)
                      ).map(([detectorKey, detectorLabel]) => (
                        <div
                          key={`${deviceKey}-${detectorKey}`}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            padding: "0.5rem 0",
                            borderBottom: "1px solid var(--cds-border-subtle)",
                          }}
                        >
                          <div style={{ paddingRight: "1rem" }}>
                            <div style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--cds-text-primary)" }}>
                              {t(`settings.anticheat.detectors.${detectorKey}` as any, detectorLabel)}
                            </div>
                            <div style={{ fontSize: "0.75rem", color: "var(--cds-text-helper)", marginTop: "0.25rem" }}>
                              {t(`settings.anticheat.detectors.${detectorKey}Desc` as any, "")}
                            </div>
                          </div>
                          <Toggle
                            id={`settings-${deviceKey}-${detectorKey}`}
                            labelText=""
                            hideLabel
                            labelA=""
                            labelB=""
                            toggled={devicePolicy.detectors[detectorKey]}
                            onToggle={(checked) =>
                              updateDevicePolicy((next) => {
                                next[deviceKey].detectors[detectorKey] = checked;
                              })
                            }
                            size="sm"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <ActionRow
            label={t("settings.maxWarnings")}
            description="違規警告達到上限後自動鎖定該學生，0 表示立即鎖定"
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
            description="鎖定後經過指定時間自動解鎖，無需監考人員手動處理"
            saveState={getState("allowAutoUnlock")}
            onRetry={() => onRetry("allowAutoUnlock")}
          >
            <Toggle
              id="settings-auto-unlock"
              labelText=""
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
        </>
      )}
    </Section>
  );
}
