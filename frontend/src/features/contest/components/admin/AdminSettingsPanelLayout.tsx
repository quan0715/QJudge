import React from "react";
import { Layer } from "@carbon/react";
import { FieldSaveIndicator } from "@/shared/ui/autoSave/FieldSaveIndicator";
import type { FieldSaveState } from "@/features/contest/components/admin/examEditor/hooks/useExamAutoSave";
import s from "@/features/contest/screens/admin/panels/AdminContestSettingsPanel.module.scss";

// ── Shared text styles ──────────────────────────────────────────

export const TITLE_STYLE: React.CSSProperties = {
  fontSize: "var(--cds-body-short-01-font-size, 0.875rem)",
  fontWeight: 400,
  lineHeight: "1.125rem",
  color: "var(--cds-text-primary)",
};

export const DESC_STYLE: React.CSSProperties = {
  fontSize: "var(--cds-helper-text-01-font-size, 0.75rem)",
  fontWeight: 400,
  lineHeight: "1rem",
  color: "var(--cds-text-helper)",
  marginTop: "0.25rem",
};

// ── Layout primitives ───────────────────────────────────────────

export const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div className={s.section}>
    <h4 className={s.sectionTitle} style={{
      fontSize: "var(--cds-heading-compact-01-font-size, 0.875rem)",
      fontWeight: 600,
      lineHeight: "1.125rem",
      color: "var(--cds-text-primary)",
    }}>
      {title}
    </h4>
    <Layer>
      <div className={s.sectionCard}>{children}</div>
    </Layer>
  </div>
);

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
