import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';

interface SurfaceSectionProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

const SurfaceSection: React.FC<SurfaceSectionProps> = ({ children, className, style }) => {
  const { theme } = useTheme();
  
  // Surface colors based on theme
  // Dark mode: Slightly lighter than background (#161616 vs #000000 or similar)
  // Light mode: White or slightly off-white
  const backgroundColor = theme === 'white' 
    ? 'var(--cds-layer-01)' // White in light mode
    : 'var(--cds-layer-01)'; // Dark gray in dark mode (g100)

  return (
    <div 
      className={className}
      style={{
        backgroundColor,
        width: '100%',
        padding: '1rem 2rem', // Default padding
        ...style
      }}
    >
      {children}
    </div>
  );
};

export default SurfaceSection;
