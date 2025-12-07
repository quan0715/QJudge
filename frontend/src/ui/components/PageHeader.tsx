import { Breadcrumb, BreadcrumbItem } from '@carbon/react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

interface PageHeaderProps {
  title: string;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: ReactNode;
  subtitle?: ReactNode;
}

export const PageHeader = ({ title, breadcrumbs, actions, subtitle }: PageHeaderProps) => {
  const navigate = useNavigate();

  return (
    <div style={{ 
      marginBottom: '2rem', 
      paddingBottom: '1rem', 
      borderBottom: '1px solid var(--cds-border-subtle-01)' 
    }}>
      {breadcrumbs && (
        <Breadcrumb noTrailingSlash style={{ marginBottom: '0.5rem' }}>
          {breadcrumbs.map((crumb, index) => (
            <BreadcrumbItem 
              key={index} 
              isCurrentPage={index === breadcrumbs.length - 1}
              onClick={crumb.href ? (e) => {
                e.preventDefault();
                navigate(crumb.href!);
              } : undefined}
              href={crumb.href || '#'}
            >
              {crumb.label}
            </BreadcrumbItem>
          ))}
        </Breadcrumb>
      )}
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h2 style={{ margin: 0 }}>{title}</h2>
          {subtitle && (
            <div style={{ marginTop: '0.5rem', color: 'var(--cds-text-secondary)' }}>
              {subtitle}
            </div>
          )}
        </div>
        {actions && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};
