import { Tile, Button } from '@carbon/react';
import type { ReactNode } from 'react';
import { ArrowRight } from '@carbon/icons-react';

interface CardProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  style?: React.CSSProperties;
}

export const Card = ({ title, subtitle, children, action, className = '', style }: CardProps) => {
  return (
    <Tile className={`common-card ${className}`} style={{ height: '100%', display: 'flex', flexDirection: 'column', ...style }}>
      {(title || subtitle) && (
        <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            {title && <h4 style={{ margin: 0, marginBottom: subtitle ? '0.25rem' : 0 }}>{title}</h4>}
            {subtitle && <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>{subtitle}</p>}
          </div>
          {action && (
            <Button kind="ghost" size="sm" onClick={action.onClick} renderIcon={ArrowRight}>
              {action.label}
            </Button>
          )}
        </div>
      )}
      <div style={{ flex: 1 }}>
        {children}
      </div>
    </Tile>
  );
};
