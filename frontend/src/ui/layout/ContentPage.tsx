import React from 'react';
// import { useTheme } from '@/ui/theme/ThemeContext';

interface ContentPageProps {
  children: React.ReactNode;
  hero?: React.ReactNode;
  header?: React.ReactNode;
  sidebar?: React.ReactNode;
  className?: string;
  contentStyle?: React.CSSProperties;
}

/**
 * A shared layout component that provides the standard "Hero + Scrollable Content + Surface" structure.
 */
export const ContentPage: React.FC<ContentPageProps> = ({ 
  children, 
  hero, 
  header,
  sidebar,
  className,
  contentStyle
}) => {
  // const { theme } = useTheme();

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Optional Custom Header or Global Bar Area */}
      {header}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden', position: 'relative' }}>
        
        {/* Optional Sidebar Area */}
        {sidebar}

        <div 
          className={className}
          style={{ 
            flex: 1, 
            display: 'flex', 
            flexDirection: 'column', 
            overflow: 'hidden', 
            backgroundColor: 'var(--cds-background)',
            ...contentStyle
          }}
        >
          <div className="content-scroll-container" style={{ 
            flex: 1, 
            overflow: 'auto',
            backgroundColor: 'var(--cds-background)',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Hero Section - Scrolls with content */}
            {hero && (
              <div style={{ flexShrink: 0 }}>
                {hero}
              </div>
            )}

            {/* Main Content Area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
