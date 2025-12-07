import React from 'react';
import { useTheme } from '@/ui/theme/ThemeContext';

interface SurfaceSectionProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Max width of inner content, undefined = 100% */
  maxWidth?: string;
}

const SurfaceSection: React.FC<SurfaceSectionProps> = ({ children, className, style, maxWidth }) => {
  const { theme } = useTheme();
  
  // Surface colors based on theme
  const backgroundColor = theme === 'white' 
    ? 'var(--cds-layer-01)'
    : 'var(--cds-layer-01)';

  return (
    <div 
      className={className}
      style={{
        backgroundColor,
        width: '100%',
        ...style
      }}
    >
      {/* Inner container with optional max-width */}
      <div style={{
        maxWidth: maxWidth,
        margin: maxWidth ? '0 auto' : undefined,
        padding: '1rem',
      }}>
        {children}
      </div>
    </div>
  );
};

export default SurfaceSection;
