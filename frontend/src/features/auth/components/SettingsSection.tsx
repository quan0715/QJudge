import type { ReactNode } from "react";
import "./SettingsSection.scss";

interface SettingsSectionProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}

export function SettingsSection({ title, description, action, children }: SettingsSectionProps) {
  return (
    <div className="settings-section">
      <div className="settings-section__header">
        <div>
          <h4 className="settings-section__title">{title}</h4>
          {description && (
            <p className="settings-section__desc">{description}</p>
          )}
        </div>
        {action && <div className="settings-section__action">{action}</div>}
      </div>
      <div className="settings-section__body">{children}</div>
    </div>
  );
}

interface SettingsFieldProps {
  label?: string;
  description?: string;
  children: ReactNode;
}

export function SettingsField({ label, description, children }: SettingsFieldProps) {
  return (
    <div className="settings-field">
      {label && (
        <div className="settings-field__label-group">
          <div className="settings-field__label">{label}</div>
          {description && <div className="settings-field__desc">{description}</div>}
        </div>
      )}
      <div className="settings-field__value">{children}</div>
    </div>
  );
}
