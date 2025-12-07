import React from 'react';
import { Grid, Column } from '@carbon/react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  extra?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, extra }) => {
  return (
    <div style={{ marginTop: 'var(--cds-spacing-09, 3rem)', marginBottom: 'var(--cds-spacing-07, 2rem)' }}>
      <Grid>
        <Column lg={16} md={8} sm={4}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{ 
                fontSize: 'var(--cds-productive-heading-05, 2rem)', 
                fontWeight: 400, 
                lineHeight: 1.25,
                marginBottom: 'var(--cds-spacing-03, 0.5rem)',
                color: 'var(--cds-text-primary)'
              }}>
                {title}
              </h1>
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
            {extra && (
              <div>
                {extra}
              </div>
            )}
          </div>
        </Column>
      </Grid>
    </div>
  );
};
