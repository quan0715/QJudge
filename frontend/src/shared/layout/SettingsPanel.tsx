import type { ReactNode } from "react";
import s from "./SettingsPanel.module.scss";

export { s as settingsPanelStyles };

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
  descriptionId,
  children,
}: {
  label: string;
  description?: string;
  descriptionId?: string;
  children: ReactNode;
}) => (
  <div className={s.fieldRow}>
    <div className={[s.fieldRowHeader, !description && s.fieldRowHeaderOnly].filter(Boolean).join(" ")}>
      <div className={s.rowTitle}>{label}</div>
    </div>
    {description && <div id={descriptionId} className={s.fieldDescription}>{description}</div>}
    <div>{children}</div>
  </div>
);

/* ── ActionRow (label + desc ↔ inline control) ────────────── */

export const ActionRow = ({
  label,
  labelId,
  description,
  descriptionId,
  children,
}: {
  label: string;
  /** Lets the inline control name itself with `aria-labelledby` instead of repeating the label. */
  labelId?: string;
  description?: string;
  descriptionId?: string;
  children: ReactNode;
}) => (
  <div className={s.actionRow}>
    <div className={s.actionRowContent}>
      <div id={labelId} className={s.rowTitle}>{label}</div>
      {description && <div id={descriptionId} className={s.rowDescription}>{description}</div>}
    </div>
    <div className={s.actionRowControl}>{children}</div>
  </div>
);
