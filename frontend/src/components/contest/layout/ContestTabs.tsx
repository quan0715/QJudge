import React from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import type { ContestDetail } from '@/models/contest';
import ContestTabsBase from './ContestTabsBase';

interface ContestTabsProps {
  contest: ContestDetail | null;
}

const ContestTabs: React.FC<ContestTabsProps> = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { contestId } = useParams<{ contestId: string }>();

  const tabs = [
    { label: '總覽 (Overview)', path: '', key: 'overview' }, // index route
    { label: '題目 (Problems)', path: 'problems', key: 'problems' },
    { label: '提交 (Submissions)', path: 'submissions', key: 'submissions' },
    { label: '排名 (Ranking)', path: 'standings', key: 'standings' },
    { label: '提問 (Clarifications)', path: 'clarifications', key: 'clarifications' },
  ];

  // Determine active tab index
  const getCurrentTabIndex = () => {
    const currentPath = location.pathname.split(`/contests/${contestId}/`)[1] || '';
    // Handle exact match for root
    if (location.pathname === `/contests/${contestId}` || location.pathname === `/contests/${contestId}/`) {
      return 0;
    }
    
    // Find matching tab
    const index = tabs.findIndex(tab => tab.path !== '' && currentPath.startsWith(tab.path));
    return index !== -1 ? index : 0; // Default to Overview if not found (or sub-routes)
  };

  const handleTabChange = (selectedIndex: number) => {
    const path = tabs[selectedIndex].path;
    navigate(`/contests/${contestId}/${path}`);
  };

  return (
    <ContestTabsBase 
      items={tabs.map(t => ({ label: t.label, key: t.key }))}
      selectedIndex={getCurrentTabIndex()}
      onChange={handleTabChange}
    />
  );
};

export default ContestTabs;
