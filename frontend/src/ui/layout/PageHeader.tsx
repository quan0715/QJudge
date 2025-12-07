import React from 'react';
import { Grid, Column } from '@carbon/react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  extra?: React.ReactNode; 
  action?: React.ReactNode; // Alias for extra or secondary action
  tags?: React.ReactNode[];
  maxWidth?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, extra, action, tags, maxWidth }) => {
  return (
    <div style={{ 
      marginTop: 'var(--cds-spacing-09, 3rem)', 
      marginBottom: 'var(--cds-spacing-07, 2rem)',
      maxWidth: maxWidth || undefined,
      marginLeft: maxWidth ? 'auto' : undefined,
      marginRight: maxWidth ? 'auto' : undefined,
      width: '100%',
      padding: maxWidth ? '0 1rem' : undefined
    }}>
      <Grid>
        <Column lg={16} md={8} sm={4}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: 'var(--cds-spacing-03, 0.5rem)' }}>
                <h1 style={{ 
                  fontSize: 'var(--cds-productive-heading-05, 2rem)', 
                  fontWeight: 400, 
                  lineHeight: 1.25,
                  margin: 0,
                  color: 'var(--cds-text-primary)'
                }}>
                  {title}
                </h1>
                {tags && tags.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {tags}
                  </div>
                )}
              </div>
              {subtitle && (
                <p style={{ 
                  fontSize: 'var(--cds-body-long-01, 0.875rem)',
                  lineHeight: 1.5,
                  color: 'var(--cds-text-secondary)',
                  maxWidth: '640px' 
                }}>
                  {subtitle}
                </p>
              )}
            </div>
            {(extra || action) && (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {extra}
                {action}
              </div>
            )}
          </div>
        </Column>
      </Grid>
    </div>
  );
};

