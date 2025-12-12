import React from 'react';
import { useTheme } from '@/ui/theme/ThemeContext';
import styles from './SurfaceSection.module.scss';

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
      className={`${styles.container} ${className || ''}`}
      style={{
        backgroundColor,
        ...style
      }}
    >
      {/* Inner container with optional max-width */}
      <div className={styles.inner} style={{
        maxWidth: maxWidth,
        margin: maxWidth ? '0 auto' : undefined,
      }}>
        {children}
      </div>
    </div>
  );
};

export default SurfaceSection;
