import React from 'react';

interface DataCardProps {
  icon: React.ComponentType<{ size?: number }>;
  value: string | number;
  label: string;
  showBorder?: boolean;
}

/**
 * A KPI-style data card displaying an icon, value, and label.
 * Used in Hero sections to show statistics.
 */
export const DataCard: React.FC<DataCardProps> = ({ 
  icon: Icon, 
  value, 
  label,
  showBorder = true 
}) => (
  <div style={{ 
    display: 'flex', 
    flexDirection: 'column', 
    padding: '0 2rem',
    borderLeft: showBorder ? '1px solid var(--cds-border-subtle)' : 'none',
    minWidth: '120px',
    alignItems: 'flex-start'
  }}>
    <div style={{ marginBottom: '0.5rem', color: 'var(--cds-text-secondary)' }}>
      <Icon size={20} />
    </div>
    <div style={{ fontSize: '2rem', fontWeight: 300, lineHeight: 1, marginBottom: '0.25rem' }}>
      {value}
    </div>
    <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
      {label}
    </div>
  </div>
);

export default DataCard;
