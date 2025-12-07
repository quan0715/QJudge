import React from 'react';
import { Tabs, Tab, TabList } from '@carbon/react';

interface TabItem {
  label: string;
  key: string;
}

interface StickyTabsProps {
  items: TabItem[];
  selectedIndex: number;
  onChange: (index: number) => void;
  ariaLabel?: string;
  /** Max width for content alignment. undefined = 100% */
  maxWidth?: string;
}

/**
 * Reusable sticky tabs component for hero sections
 * Sticks below the header (3rem/48px) and provides consistent styling
 */
export const StickyTabs: React.FC<StickyTabsProps> = ({ 
  items, 
  selectedIndex, 
  onChange,
  ariaLabel = 'Navigation tabs',
  maxWidth = '1056px'  // Default to match common layout width
}) => {
  return (
    <div style={{ 
      position: 'sticky',
      top: '3rem', // Stick below the 48px Navbar
      zIndex: 90, 
      backgroundColor: 'var(--cds-background)',
      borderBottom: '1px solid var(--cds-border-subtle)',
      width: '100%',
    }}>
      <div style={{ 
        maxWidth: maxWidth, 
        margin: maxWidth ? '0 auto' : undefined, 
        width: '100%',
        padding: '0 1rem'
      }}>
        <Tabs 
          selectedIndex={selectedIndex} 
          onChange={({ selectedIndex }: { selectedIndex: number }) => onChange(selectedIndex)}
        >
          <TabList aria-label={ariaLabel}>
            {items.map((item) => (
              <Tab key={item.key}>{item.label}</Tab>
            ))}
          </TabList>
        </Tabs>
      </div>
    </div>
  );
};

export default StickyTabs;
