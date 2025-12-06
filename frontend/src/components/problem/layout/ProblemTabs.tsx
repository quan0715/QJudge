
import React from 'react';
import ContestTabsBase from '@/components/contest/layout/ContestTabsBase';

interface ProblemTabsProps {
  selectedIndex: number;
  onChange: (index: number) => void;
  isAdmin?: boolean;
}

const ProblemTabs: React.FC<ProblemTabsProps> = ({ selectedIndex, onChange, isAdmin }) => {
  const tabs = [
    { label: '題目說明 (Description)', key: 'description' },
    { label: '解題與提交 (Solver & Submit)', key: 'solver' },
    { label: '提交記錄 (History)', key: 'history' },
    { label: '解題統計 (Statistics)', key: 'stats' },
  ];

  if (isAdmin) {
    tabs.push({ label: '設定題目 (Settings)', key: 'settings' });
  }

  return (
    <ContestTabsBase 
      items={tabs}
      selectedIndex={selectedIndex}
      onChange={onChange}
    />
  );
};

export default ProblemTabs;
