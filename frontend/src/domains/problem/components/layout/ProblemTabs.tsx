
import React from 'react';
import { StickyTabs } from '@/ui/components/StickyTabs';

interface ProblemTabsProps {
  selectedIndex: number;
  onChange: (index: number) => void;
  isAdmin?: boolean;
  maxWidth?: string;
}

const ProblemTabs: React.FC<ProblemTabsProps> = ({ selectedIndex, onChange, isAdmin, maxWidth }) => {
  const tabs = [
    { label: '題目', key: 'description' },
    { label: '解題與提交', key: 'solver' },
    { label: '提交記錄', key: 'history' },
    { label: '解題統計', key: 'stats' },
  ];

  if (isAdmin) {
    tabs.push({ label: '設定題目', key: 'settings' });
  }

  return (
    <StickyTabs 
      items={tabs}
      selectedIndex={selectedIndex}
      onChange={onChange}
      ariaLabel="Problem navigation"
      maxWidth={maxWidth}
    />
  );
};

export default ProblemTabs;
