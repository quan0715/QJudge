import type { CSSProperties, ReactNode } from "react";
import s from "./SettingsPanel.module.scss";

export const TITLE_STYLE: CSSProperties = {
  fontSize: "var(--cds-body-short-01-font-size, 0.875rem)",
  fontWeight: 400,
  lineHeight: "1.125rem",
  color: "var(--cds-text-primary)",
};

export const DESC_STYLE: CSSProperties = {
  fontSize: "var(--cds-helper-text-01-font-size, 0.75rem)",
  fontWeight: 400,
  lineHeight: "1rem",
  color: "var(--cds-text-helper)",
  marginTop: "0.25rem",
};

export { s as settingsPanelStyles };

/* ── Root shell ─────────────────────────────────────────────── */

export const SettingsPanelRoot = ({
  children,
  trailing,
}: {
  children: ReactNode;
  trailing?: ReactNode;
}) => (
  <div className={s.root}>
    <div className={s.inner}>
      <div className={s.pageHeader}>
        {children}
      </div>
      {trailing}
    </div>
  </div>
);

/* ── Section (title + description + action + body) ─────────── */

export const Section = ({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) => (
  <div className={s.section}>
    <div className={s.sectionHeader}>
      <div>
        <h4 className={s.sectionTitle}>{title}</h4>
        {description && <p className={s.sectionDesc}>{description}</p>}
      </div>
      {action && <div className={s.sectionAction}>{action}</div>}
    </div>
    <div>{children}</div>
  </div>
);

/* ── FieldRow (label + description + full-width control) ───── */

export const FieldRow = ({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) => (
  <div className={s.fieldRow}>
    <div className={s.fieldRowHeader} style={{ marginBottom: description ? 0 : "0.5rem" }}>
      <div style={TITLE_STYLE}>{label}</div>
    </div>
    {description && <div style={{ ...DESC_STYLE, marginBottom: "0.5rem" }}>{description}</div>}
    <div>{children}</div>
  </div>
);

/* ── ActionRow (label + desc ↔ inline control) ────────────── */

export const ActionRow = ({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) => (
  <div className={s.actionRow}>
    <div className={s.actionRowContent}>
      <div style={TITLE_STYLE}>{label}</div>
      {description && <div style={DESC_STYLE}>{description}</div>}
    </div>
    <div className={s.actionRowControl}>{children}</div>
  </div>
);
