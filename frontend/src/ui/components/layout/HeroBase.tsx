
import React, { useState, useEffect } from 'react';
import { SkeletonText } from '@carbon/react';

interface HeroBaseProps {
  // Header
  breadcrumbs?: React.ReactNode;

  // Main Content
  title: string;
  description?: React.ReactNode;
  badges?: React.ReactNode;
  metadata?: React.ReactNode;
  actions?: React.ReactNode;
  
  // Right Column
  kpiCards?: React.ReactNode;
  
  // Bottom Row
  progressBar?: React.ReactNode;
  
  // Footer
  bottomContent?: React.ReactNode;
  
  // Layout
  maxWidth?: string;  // undefined = 100%, or specify like '1056px'
  
  // State
  loading?: boolean;
}

export const HeroBase: React.FC<HeroBaseProps> = ({
  breadcrumbs,
  title,
  description,
  badges,
  metadata,
  actions,
  kpiCards,
  progressBar,
  bottomContent,
  maxWidth,
  loading = false
}) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const query = '(max-width: 1056px)';
    const media = window.matchMedia(query);
    setIsMobile(media.matches);
    const listener = () => setIsMobile(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '2rem', backgroundColor: 'var(--cds-layer-01)', borderBottom: '1px solid var(--cds-border-subtle)' }}>
        <SkeletonText heading width="30%" />
        <SkeletonText width="20%" />
      </div>
    );
  }

  return (
    <div style={{ 
      backgroundColor: 'var(--cds-background)', 
      width: '100%',
      borderBottom: '1px solid var(--cds-border-subtle)'
    }}>
      <div style={{ 
        maxWidth: maxWidth, 
        margin: maxWidth ? '0 auto' : undefined, 
        width: '100%',
        padding: '1rem'
      }}>
        {/* Breadcrumbs */}
        {breadcrumbs && (
            <div style={{ marginBottom: '1rem' }}>
                {breadcrumbs}
            </div>
        )}

        {/* HeroTopRow */}
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'flex-start' : 'flex-start',
          gap: '2rem',
          marginBottom: '2rem'
        }}>
          {/* HeroInfoColumn (Left) */}
          <div style={{ 
            flex: '1 1 auto', 
            display: 'flex', 
            flexDirection: 'column',
            maxWidth: isMobile ? '100%' : '65%'
          }}>

            {badges && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                {badges}
                </div>
            )}
            <h1 style={{ 
             fontSize: 'var(--cds-heading-06, 2.625rem)',
             fontWeight: 400,
             lineHeight: 1.25,
             letterSpacing: 0,
             marginBottom: '0.5rem',
             color: 'var(--cds-text-primary)'
            }}>
              {title}
            </h1>
            
            {description && (
                <div style={{ 
                fontSize: '1rem', 
                color: 'var(--cds-text-secondary)',
                marginBottom: '1.5rem',
                maxWidth: '600px',
                lineHeight: 1.5
                }}>
                {description}
                </div>
            )}


            {metadata && (
                <div style={{ display: 'flex', gap: '2rem', color: 'var(--cds-text-secondary)', fontSize: '0.875rem', flexWrap: 'wrap' }}>
                    {metadata}
                </div>
            )}
          </div>

          {/* HeroActions & KPIs (Right) */}
          <div style={{ 
              flex: '0 0 auto', 
              display: 'flex', 
              flexDirection: 'column',
              alignItems: isMobile ? 'flex-start' : 'flex-end',
              gap: '1rem'
          }}>
              {actions && (
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  {actions}
                  </div>
              )}
              {kpiCards && (
                  <div style={{ 
                      display: 'flex', 
                      gap: '0', 
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      marginTop: actions ? '1rem' : 0
                  }}>
                      {kpiCards}
                  </div>
              )}
          </div>
        </div>

        {/* Progress Bar Row */}
        {progressBar && (
            <div className="cds--row">
            <div className="cds--col-lg-16">
                {progressBar}
            </div>
            </div>
        )}
      </div>
      
      {bottomContent}
    </div>
  );
};
