import React from 'react';
import { Tile } from '@carbon/react';

interface DataCardProps {
  title: string;
  value: React.ReactNode;
  description?: string;
  unit?: string;
  icon?: React.ReactNode;
}

interface DataCardConfig {
  size?: "sm" | "default" | "lg" | "xl";
  fillBackground?: boolean;
  outline?: boolean;
  valueStyle?: React.CSSProperties;
}

const sizeStyles = {
  sm: {
    titleFontSize: '0.75rem',
    valueFontSize: '1.5rem',
    descriptionFontSize: '0.625rem',
    valueLineHeight: 1.2,
    marginBottom: '0.25rem',
  },
  default: {
    titleFontSize: '0.875rem',
    valueFontSize: '2rem',
    descriptionFontSize: '0.75rem',
    valueLineHeight: 1,
    marginBottom: '0.5rem',
  },
  lg: {
    titleFontSize: '1rem',
    valueFontSize: '2.5rem',
    descriptionFontSize: '0.875rem',
    valueLineHeight: 1,
    marginBottom: '0.75rem',
  },
  xl: {
    titleFontSize: '1.125rem',
    valueFontSize: '3rem',
    descriptionFontSize: '1rem',
    valueLineHeight: 1,
    marginBottom: '1rem',
  },
};

const DataCard: React.FC<DataCardProps & DataCardConfig> = ({
  title,
  value,
  description,
  unit,
  icon,
  size = "default",
  fillBackground = false,
  outline = true,
  valueStyle,
}) => {
  const currentSizeStyles = sizeStyles[size];

  const tileStyle: React.CSSProperties = {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '1rem',
    background: 'transparent',
    ...(outline && { border: '1px solid var(--cds-border-subtle)' }),
    ...(fillBackground && { backgroundColor: 'var(--cds-background-active)' }),
  };

  return (
    <Tile style={tileStyle}>
      <div style={{
        fontSize: currentSizeStyles.titleFontSize,
        color: 'var(--cds-text-secondary)',
        marginBottom: currentSizeStyles.marginBottom,
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
      }}>
        {title}
        {icon && <span>{icon}</span>}
      </div>
      <div style={{
        fontSize: currentSizeStyles.valueFontSize,
        fontWeight: 300,
        lineHeight: currentSizeStyles.valueLineHeight,
        marginBottom: currentSizeStyles.marginBottom,
        display: 'flex',
        alignItems: 'baseline',
        gap: '0.25rem',
        ...valueStyle
      }}>
        {value}
        {unit && <span style={{ fontSize: '0.6em', color: 'var(--cds-text-secondary)' }}>{unit}</span>}
      </div>
      {description && (
        <div style={{
          fontSize: currentSizeStyles.descriptionFontSize,
          color: 'var(--cds-text-secondary)'
        }}>
          {description}
        </div>
      )}
    </Tile>
  );
};

export default DataCard;