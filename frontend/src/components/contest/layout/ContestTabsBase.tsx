import React from 'react';
import { Tabs, Tab, TabList } from '@carbon/react';

interface ContestTabsBaseProps {
  items: { label: string; key: string }[];
  selectedIndex: number;
  onChange: (index: number) => void;
}

const ContestTabsBase: React.FC<ContestTabsBaseProps> = ({ items, selectedIndex, onChange }) => {
  return (
    <div style={{ 
      position: 'sticky',
      top: '3rem', // Stick below the 3rem (48px) Navbar
      zIndex: 90, // Below Navbar (100+) but above content
      backgroundColor: 'var(--cds-layer-02)', // Match Hero background
      borderBottom: '1px solid var(--cds-border-subtle)',
      width: '100%',
      paddingTop: '1rem' // Add some spacing above tabs if needed, or keep 0
    }}>
      <div className="cds--grid" style={{ 
        paddingLeft: '2.5rem', 
        paddingRight: '2.5rem',
        maxWidth: '100%',
        margin: 0
      }}>
        <div className="cds--row">
          <div className="cds--col-lg-16" style={{ padding: 0 }}>
            <Tabs 
              selectedIndex={selectedIndex} 
              onChange={({ selectedIndex }: { selectedIndex: number }) => onChange(selectedIndex)}
            >
              <TabList aria-label="Contest navigation">
                {items.map((item) => (
                  <Tab key={item.key}>{item.label}</Tab>
                ))}
              </TabList>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContestTabsBase;
