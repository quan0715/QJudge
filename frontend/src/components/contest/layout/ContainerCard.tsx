import React from 'react';

interface ContainerCardProps {
  children: React.ReactNode;
  title?: string;
  action?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  noPadding?: boolean;
}

const ContainerCard: React.FC<ContainerCardProps> = ({ 
  children, 
  title, 
  action, 
  className, 
  style,
  noPadding = false
}) => {
  return (
    <div 
      className={className}
      style={{
        backgroundColor: 'var(--cds-layer-02)', // Distinct from surface
        border: '1px solid var(--cds-border-subtle)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        ...style
      }}
    >
      {(title || action) && (
        <div style={{ 
          padding: '1rem', 
          borderBottom: '1px solid var(--cds-border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          {title && (
            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
              {title}
            </h4>
          )}
          {action && <div>{action}</div>}
        </div>
      )}
      <div style={{ 
        padding: noPadding ? 0 : '1rem', 
        flex: 1,
        overflow: 'auto' 
      }}>
        {children}
      </div>
    </div>
  );
};

export default ContainerCard;
