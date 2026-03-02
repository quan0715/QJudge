import React from "react";
import { Toggle, NumberInput } from "@carbon/react";
import { useFormContext } from "react-hook-form";
import { FieldSaveIndicator } from "@/shared/ui/autoSave";
import type { ExamFormSchema } from "../forms/examFormSchema";
import { useExamEdit } from "../contexts/ExamEditContext";

interface ExamSettingsSectionProps {
  registerRef: (el: HTMLElement | null) => void;
}

const ExamSettingsSection: React.FC<ExamSettingsSectionProps> = ({ registerRef }) => {
  const { setValue, watch } = useFormContext<ExamFormSchema>();
  const { handleFieldChange, getFieldSaveState } = useExamEdit();

  const cheatDetectionEnabled = watch("cheatDetectionEnabled");
  const allowAutoUnlock = watch("allowAutoUnlock");

  const handleToggle = (field: keyof ExamFormSchema, checked: boolean) => {
    setValue(field, checked);
    handleFieldChange(field, checked);
  };

  const handleNumberChange = (field: keyof ExamFormSchema, value: number) => {
    setValue(field, value);
    handleFieldChange(field, value);
  };

  return (
    <section id="exam-settings" ref={registerRef}>
      <h3 style={{ fontSize: "var(--cds-heading-03-font-size)", fontWeight: 600, marginBottom: "1.5rem" }}>
        考試設定
      </h3>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Toggle
              id="exam-mode-toggle"
              labelText="作弊檢查"
              labelA="關閉"
              labelB="開啟"
              toggled={cheatDetectionEnabled}
              onToggle={(checked) => handleToggle("cheatDetectionEnabled", checked)}
            />
            <FieldSaveIndicator status={getFieldSaveState("cheatDetectionEnabled")?.status || "idle"} />
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.5rem" }}>
            開啟後將啟用作弊檢查功能，包含作弊偵測和答案鎖定機制。
          </p>
        </div>

        {cheatDetectionEnabled && (
          <>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Toggle
                  id="allow-multiple-joins-toggle"
                  labelText="允許重複加入"
                  labelA="禁止"
                  labelB="允許"
                  toggled={watch("allowMultipleJoins")}
                  onToggle={(checked) => handleToggle("allowMultipleJoins", checked)}
                />
                <FieldSaveIndicator status={getFieldSaveState("allowMultipleJoins")?.status || "idle"} />
              </div>
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
                <NumberInput
                  id="max-warnings-input"
                  label="最大警告次數"
                  min={0}
                  max={10}
                  value={watch("maxCheatWarnings")}
                  onChange={(_: unknown, { value }: { value: string | number }) =>
                    handleNumberChange("maxCheatWarnings", Number(value))
                  }
                  style={{ maxWidth: "200px" }}
                />
                <div style={{ marginTop: "1.5rem" }}>
                  <FieldSaveIndicator
                    status={getFieldSaveState("maxCheatWarnings")?.status || "idle"}
                  />
                </div>
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--cds-border-subtle)", margin: "0.5rem 0" }} />

            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Toggle
                  id="allow-auto-unlock-toggle"
                  labelText="允許自動解鎖"
                  labelA="禁止"
                  labelB="允許"
                  toggled={allowAutoUnlock}
                  onToggle={(checked) => handleToggle("allowAutoUnlock", checked)}
                />
                <FieldSaveIndicator status={getFieldSaveState("allowAutoUnlock")?.status || "idle"} />
              </div>
            </div>

            {allowAutoUnlock && (
              <div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
                  <NumberInput
                    id="auto-unlock-minutes-input"
                    label="自動解鎖時間（分鐘）"
                    helperText="被鎖定的學生在指定時間後自動解鎖"
                    min={1}
                    max={1440}
                    value={watch("autoUnlockMinutes")}
                    onChange={(_: unknown, { value }: { value: string | number }) =>
                      handleNumberChange("autoUnlockMinutes", Number(value))
                    }
                    style={{ maxWidth: "200px" }}
                  />
                  <FieldSaveIndicator status={getFieldSaveState("autoUnlockMinutes")?.status || "idle"} />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
};

export default ExamSettingsSection;
