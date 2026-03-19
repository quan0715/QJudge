import React from "react";
import { FieldSaveIndicator } from "@/shared/ui/autoSave/FieldSaveIndicator";
import type { FieldSaveState } from "@/features/contest/components/admin/examEditor/hooks/useExamAutoSave";
import {
  TITLE_STYLE,
  DESC_STYLE,
  Section as SharedSection,
  settingsPanelStyles as s,
} from "@/shared/layout/SettingsPanel";

// Re-export shared primitives for backwards compatibility
export { TITLE_STYLE, DESC_STYLE };
export const Section = SharedSection;

// Contest-specific wrappers that add save-state indicators

interface RowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
  saveState?: FieldSaveState;
  onRetry?: () => void;
}

export const ActionRow: React.FC<RowProps> = ({
  label, description, children, saveState, onRetry,
}) => (
  <div className={s.actionRow}>
    <div className={s.actionRowContent}>
      <div style={TITLE_STYLE}>{label}</div>
      {description && <div style={DESC_STYLE}>{description}</div>}
    </div>
    <div className={s.actionRowControl}>{children}</div>
    {saveState && saveState.status !== "idle" && (
      <FieldSaveIndicator status={saveState.status} error={saveState.error} onRetry={onRetry} />
    )}
  </div>
);

export const FieldRow: React.FC<RowProps> = ({
  label, description, children, saveState, onRetry,
}) => (
  <div className={s.fieldRow}>
    <div className={s.fieldRowHeader} style={{ marginBottom: description ? 0 : "0.5rem" }}>
      <div style={TITLE_STYLE}>{label}</div>
      {saveState && saveState.status !== "idle" && (
        <FieldSaveIndicator status={saveState.status} error={saveState.error} onRetry={onRetry} />
      )}
    </div>
    {description && <div style={{ ...DESC_STYLE, marginBottom: "0.5rem" }}>{description}</div>}
    <div>{children}</div>
  </div>
);
