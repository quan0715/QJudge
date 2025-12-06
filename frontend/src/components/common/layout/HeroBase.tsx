
import React, { useState, useEffect } from 'react';
import { SkeletonText } from '@carbon/react';

interface HeroBaseProps {
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
  
  // State
  loading?: boolean;
}

export const HeroBase: React.FC<HeroBaseProps> = ({
  title,
  description,
  badges,
  metadata,
  actions,
  kpiCards,
  progressBar,
  bottomContent,
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
      <div style={{ padding: '2rem', backgroundColor: 'var(--cds-layer-02)', borderBottom: '1px solid var(--cds-border-subtle)' }}>
        <SkeletonText heading width="30%" />
        <SkeletonText width="20%" />
      </div>
    );
  }

  return (
    <div style={{ 
      backgroundColor: 'var(--cds-layer-02)',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div className="cds--grid" style={{ 
        paddingLeft: '2.5rem', 
        paddingRight: '2.5rem',
        paddingTop: '3rem',
        paddingBottom: '0',
        maxWidth: '100%',
        margin: 0,
        flex: 1
      }}>
        {/* HeroTopRow */}
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'flex-start' : 'center',
          gap: '2rem',
          flexWrap: isMobile ? 'wrap' : 'nowrap',
          marginBottom: '2rem'
        }}>
          {/* HeroInfoColumn (Left) */}
          <div style={{ 
            flex: isMobile ? '1 1 auto' : '1 1 65%', 
            display: 'flex', 
            flexDirection: 'column',
            maxWidth: isMobile ? '100%' : '70%'
          }}>
            {badges && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                {badges}
                </div>
            )}
            
            <h1 style={{ 
              fontSize: '3rem', 
              fontWeight: 300, 
              marginBottom: '1rem',
              color: 'var(--cds-text-primary)',
              lineHeight: 1.1
            }}>
              {title}
            </h1>
            
            {description && (
                <div style={{ 
                fontSize: '1rem', 
                color: 'var(--cds-text-secondary)',
                marginBottom: '1.5rem',
                maxWidth: '600px',
                lineHeight: 1.6
                }}>
                {description}
                </div>
            )}

            {metadata && (
                <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem', color: 'var(--cds-text-secondary)', fontSize: '0.875rem', flexWrap: 'wrap' }}>
                    {metadata}
                </div>
            )}

            {actions && (
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                {actions}
                </div>
            )}
          </div>

          {/* HeroKpiColumn (Right) */}
          {kpiCards && (
            <div style={{ 
                flex: isMobile ? '1 1 auto' : '0 0 auto', 
                display: 'flex', 
                gap: '0', 
                alignItems: 'center',
                marginTop: isMobile ? '2rem' : 0,
                flexWrap: 'wrap'
            }}>
                {kpiCards}
            </div>
          )}
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
