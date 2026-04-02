import { useRef, useEffect, type ChangeEvent } from "react";
import type { TFunction } from "i18next";
import {
  TextInput,
  Select,
  SelectItem,
  Toggle,
  NumberInput,
  DatePicker,
  DatePickerInput,
  TimePicker,
  TimePickerSelect,
} from "@carbon/react";

import type {
  ContestDetail,
  ContestStatus,
} from "@/core/entities/contest.entity";
import type { FieldSaveState } from "@/features/contest/components/admin/examEditor/hooks/useExamAutoSave";
import { MarkdownField } from "@/shared/ui/markdown/markdownEditor";
import {
  Section,
  ActionRow,
  FieldRow,
} from "@/features/contest/components/admin/AdminSettingsPanelLayout";

type TranslateFn = TFunction;

const STATUS_LABELS: Record<ContestStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

interface AdminContestSettingsFormSectionsProps {
  t: TranslateFn;
  tc: TranslateFn;
  contest: ContestDetail;
  form: Record<string, unknown>;
  startDateInput: Date | null;
  endDateInput: Date | null;
  startTimeInput: string;
  endTimeInput: string;
  startMeridiem: "AM" | "PM";
  endMeridiem: "AM" | "PM";
  getState: (field: string) => FieldSaveState | undefined;
  onRetry: (field: string) => void;
  onChange: (field: string, value: unknown) => void;
  onConfirmedChange: (field: string, value: unknown, message: string) => void;
  onStartDateChange: (dates: Date[]) => void;
  onEndDateChange: (dates: Date[]) => void;
  onStartTimeChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onEndTimeChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onStartMeridiemChange: (value: string) => void;
  onEndMeridiemChange: (value: string) => void;
}

const AdminContestSettingsFormSections = ({
  t,
  tc,
  contest,
  form,
  startDateInput,
  endDateInput,
  startTimeInput,
  endTimeInput,
  startMeridiem,
  endMeridiem,
  getState,
  onRetry,
  onChange,
  onConfirmedChange,
  onStartDateChange,
  onEndDateChange,
  onStartTimeChange,
  onEndTimeChange,
  onStartMeridiemChange,
  onEndMeridiemChange,
}: AdminContestSettingsFormSectionsProps) => {
  const defaultPolicy = {
    desktop: {
      enabled: true,
      sources: {
        screenShare: { enabled: true, captureIntervalSeconds: 5 },
        webcam: { enabled: false, captureIntervalSeconds: 10 },
      },
      detectors: {
        pwaMode: false,
        fullscreen: true,
        focus: true,
        tabVisibility: true,
        multiDisplay: true,
        mouseLeave: true,
        viewportIntegrity: false,
      },
    },
    tablet: {
      enabled: true,
      sources: {
        screenShare: { enabled: false, captureIntervalSeconds: 5 },
        webcam: { enabled: true, captureIntervalSeconds: 10 },
      },
      detectors: {
        pwaMode: true,
        fullscreen: false,
        focus: true,
        tabVisibility: true,
        multiDisplay: false,
        mouseLeave: true,
        viewportIntegrity: true,
      },
    },
  };

  const normalizeSource = (
    source: unknown,
    fallback: typeof defaultPolicy.desktop.sources.screenShare
  ) => {
    const sourceObj =
      source && typeof source === "object" && !Array.isArray(source)
        ? (source as Record<string, unknown>)
        : {};
    const intervalRaw =
      sourceObj.captureIntervalSeconds ??
      sourceObj.capture_interval_seconds ??
      fallback.captureIntervalSeconds;
    const interval = Number(intervalRaw);
    return {
      enabled: typeof sourceObj.enabled === "boolean" ? sourceObj.enabled : fallback.enabled,
      captureIntervalSeconds:
        Number.isFinite(interval) && interval > 0
          ? Math.floor(interval)
          : fallback.captureIntervalSeconds,
    };
  };

  const normalizeDetectors = (
    detectors: unknown,
    fallback: typeof defaultPolicy.desktop.detectors
  ) => {
    const detectorsObj =
      detectors && typeof detectors === "object" && !Array.isArray(detectors)
        ? (detectors as Record<string, unknown>)
        : {};
    return {
      pwaMode:
        typeof detectorsObj.pwaMode === "boolean"
          ? detectorsObj.pwaMode
          : typeof detectorsObj.pwa_mode === "boolean"
          ? (detectorsObj.pwa_mode as boolean)
          : fallback.pwaMode,
      fullscreen:
        typeof detectorsObj.fullscreen === "boolean"
          ? detectorsObj.fullscreen
          : fallback.fullscreen,
      focus: typeof detectorsObj.focus === "boolean" ? detectorsObj.focus : fallback.focus,
      tabVisibility:
        typeof detectorsObj.tabVisibility === "boolean"
          ? detectorsObj.tabVisibility
          : typeof detectorsObj.tab_visibility === "boolean"
          ? (detectorsObj.tab_visibility as boolean)
          : fallback.tabVisibility,
      multiDisplay:
        typeof detectorsObj.multiDisplay === "boolean"
          ? detectorsObj.multiDisplay
          : typeof detectorsObj.multi_display === "boolean"
          ? (detectorsObj.multi_display as boolean)
          : fallback.multiDisplay,
      mouseLeave:
        typeof detectorsObj.mouseLeave === "boolean"
          ? detectorsObj.mouseLeave
          : typeof detectorsObj.mouse_leave === "boolean"
          ? (detectorsObj.mouse_leave as boolean)
          : fallback.mouseLeave,
      viewportIntegrity:
        typeof detectorsObj.viewportIntegrity === "boolean"
          ? detectorsObj.viewportIntegrity
          : typeof detectorsObj.viewport_integrity === "boolean"
          ? (detectorsObj.viewport_integrity as boolean)
          : fallback.viewportIntegrity,
    };
  };

  const normalizeDevice = (
    device: unknown,
    fallback: typeof defaultPolicy.desktop
  ) => {
    const deviceObj =
      device && typeof device === "object" && !Array.isArray(device)
        ? (device as Record<string, unknown>)
        : {};
    const sourcesObj =
      deviceObj.sources && typeof deviceObj.sources === "object" && !Array.isArray(deviceObj.sources)
        ? (deviceObj.sources as Record<string, unknown>)
        : {};
    return {
      enabled: typeof deviceObj.enabled === "boolean" ? deviceObj.enabled : fallback.enabled,
      sources: {
        screenShare: normalizeSource(
          sourcesObj.screenShare ?? sourcesObj.screen_share,
          fallback.sources.screenShare
        ),
        webcam: normalizeSource(sourcesObj.webcam, fallback.sources.webcam),
      },
      detectors: normalizeDetectors(deviceObj.detectors, fallback.detectors),
    };
  };

  const rawPolicy =
    form.anticheatDevicePolicy &&
    typeof form.anticheatDevicePolicy === "object" &&
    !Array.isArray(form.anticheatDevicePolicy)
      ? (form.anticheatDevicePolicy as Record<string, unknown>)
      : {};

  const anticheatPolicy = {
    desktop: normalizeDevice(rawPolicy.desktop, defaultPolicy.desktop),
    tablet: normalizeDevice(rawPolicy.tablet, defaultPolicy.tablet),
  };

  // Use a ref to track the latest policy and avoid stale closures during rapid updates
  const policyRef = useRef(anticheatPolicy);
  useEffect(() => {
    policyRef.current = anticheatPolicy;
  }, [anticheatPolicy]);

  // Use a stable reference for the updater to prevent unnecessary re-renders or stale closures
  const updateDevicePolicy = (mutator: (next: typeof defaultPolicy) => void) => {
    try {
      // Always base the next state on the latest known value in the ref
      const next = JSON.parse(JSON.stringify(policyRef.current)) as typeof defaultPolicy;
      
      mutator(next);

      // Enforce allowed detector matrix to avoid hidden-but-active settings.
      if (next.desktop?.detectors) {
        next.desktop.detectors.pwaMode = false;
        next.desktop.detectors.viewportIntegrity = false;
      }
      if (next.tablet?.detectors) {
        next.tablet.detectors.fullscreen = false;
        next.tablet.detectors.multiDisplay = false;
      }

      // Important: update the ref immediately so subsequent rapid calls use the new base
      policyRef.current = next;
      onChange("anticheatDevicePolicy", next);
    } catch (e) {
      console.error("Failed to update anticheat policy:", e);
    }
  };

  return (
    <>
      <Section title="基本資訊">
        <FieldRow
          label={t("settings.contestName")}
          description="顯示在競賽列表和頁首的名稱"
          saveState={getState("name")}
          onRetry={() => onRetry("name")}
        >
          <TextInput
            id="settings-name"
            labelText=""
            hideLabel
            value={(form.name as string) || ""}
            onChange={(e) => onChange("name", e.target.value)}
          />
        </FieldRow>

        <FieldRow
          label={t("settings.contestDescription")}
          description="簡短描述，出現在競賽概覽頁面"
          saveState={getState("description")}
          onRetry={() => onRetry("description")}
        >
          <TextInput
            id="settings-description"
            labelText=""
            hideLabel
            value={(form.description as string) || ""}
            onChange={(e) => onChange("description", e.target.value)}
          />
        </FieldRow>

        <FieldRow
          label={t("settings.contestRules")}
          description={t("settings.rulesHelperText")}
          saveState={getState("rules")}
          onRetry={() => onRetry("rules")}
        >
          <MarkdownField
            id="settings-rules"
            value={(form.rules as string) || ""}
            onChange={(value) => onChange("rules", value)}
            minHeight="180px"
          />
        </FieldRow>

        <FieldRow
          label={tc("form.startDate")}
          description="競賽開始時間，學生只能在此時間後進入作答"
          saveState={getState("startTime")}
          onRetry={() => onRetry("startTime")}
        >
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <DatePicker
              datePickerType="single"
              dateFormat="m/d/Y"
              value={startDateInput ? [startDateInput] : []}
              onChange={onStartDateChange}
            >
              <DatePickerInput
                id="settings-start-date"
                labelText=""
                hideLabel
                placeholder="mm/dd/yyyy"
              />
            </DatePicker>
            <TimePicker
              id="settings-start-time"
              labelText=""
              hideLabel
              placeholder="hh:mm"
              value={startTimeInput}
              onChange={onStartTimeChange}
            >
              <TimePickerSelect
                id="settings-start-ampm"
                value={startMeridiem}
                onChange={(e) => onStartMeridiemChange(e.target.value)}
              >
                <SelectItem value="AM" text="AM" />
                <SelectItem value="PM" text="PM" />
              </TimePickerSelect>
            </TimePicker>
          </div>
        </FieldRow>

        <FieldRow
          label={tc("form.endDate")}
          description="競賽結束時間，超過後將自動停止收卷"
          saveState={getState("endTime")}
          onRetry={() => onRetry("endTime")}
        >
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <DatePicker
              datePickerType="single"
              dateFormat="m/d/Y"
              value={endDateInput ? [endDateInput] : []}
              onChange={onEndDateChange}
            >
              <DatePickerInput
                id="settings-end-date"
                labelText=""
                hideLabel
                placeholder="mm/dd/yyyy"
              />
            </DatePicker>
            <TimePicker
              id="settings-end-time"
              labelText=""
              hideLabel
              placeholder="hh:mm"
              value={endTimeInput}
              onChange={onEndTimeChange}
            >
              <TimePickerSelect
                id="settings-end-ampm"
                value={endMeridiem}
                onChange={(e) => onEndMeridiemChange(e.target.value)}
              >
                <SelectItem value="AM" text="AM" />
                <SelectItem value="PM" text="PM" />
              </TimePickerSelect>
            </TimePicker>
          </div>
        </FieldRow>
      </Section>

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
          label={t("settings.requiresPassword")}
          description={t("settings.requiresPasswordHelp")}
          saveState={getState("requiresPassword")}
          onRetry={() => onRetry("requiresPassword")}
        >
          <Toggle
            id="settings-requires-password"
            labelText=""
            hideLabel
            labelA={t("settings.noPassword")}
            labelB={t("settings.requiresPasswordShort")}
            toggled={!!form.requiresPassword}
            onToggle={(checked) => onChange("requiresPassword", checked)}
          />
        </ActionRow>

        {form.requiresPassword === true && (
          <FieldRow
            label={t("settings.joinPassword")}
            description="學生加入時需輸入此密碼"
            saveState={getState("password")}
            onRetry={() => onRetry("password")}
          >
            <TextInput
              id="settings-password"
              labelText=""
              hideLabel
              type="password"
              value={(form.password as string) || ""}
              onChange={(e) => onChange("password", e.target.value)}
            />
          </FieldRow>
        )}
      </Section>

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
                  Math.round(((form.screenShareRecoveryGraceMs as number) ?? 30_000) / 1000)
                )}
                onChange={(_event, { value }) =>
                  onChange(
                    "screenShareRecoveryGraceMs",
                    Math.max(1, Number(value || 30)) * 1000
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
                        textTransform: "uppercase" 
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
                                          Number(value || 1)
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
                        textTransform: "uppercase" 
                      }}>
                        {t("settings.anticheat.securityDetectors")}
                      </p>
                      
                      <div style={{ 
                        display: "grid", 
                        gridTemplateColumns: "1fr 1fr", 
                        gap: "1.5rem 2.5rem",
                        paddingBottom: "1rem"
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
                              borderBottom: "1px solid var(--cds-border-subtle)"
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
    </>
  );
};

export default AdminContestSettingsFormSections;
