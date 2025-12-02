import React from 'react';
import { Tabs, Tab, TabList } from '@carbon/react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import type { ContestDetail } from '@/models/contest';

interface ContestTabsProps {
  contest: ContestDetail | null;
}

const ContestTabs: React.FC<ContestTabsProps> = ({ contest }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { contestId } = useParams<{ contestId: string }>();

  // Map paths to tab indices
  const allTabs = [
    { label: '總覽 (Overview)', path: '' }, // index route
    { label: '題目 (Problems)', path: 'problems' },
    { label: '提交 (Submissions)', path: 'submissions' },
    { label: '排名 (Ranking)', path: 'standings' },
    { label: '提問 (Clarifications)', path: 'clarifications' },
    { label: '設定 (Settings)', path: 'settings', requiredRole: ['teacher', 'admin'] },
  ];

  // Filter tabs based on role
  const tabs = allTabs.filter(tab => {
    if (!tab.requiredRole) return true;
    if (!contest) return false;
    const role = contest.current_user_role;
    return tab.requiredRole.includes(role);
  });

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

  const handleTabChange = ({ selectedIndex }: { selectedIndex: number }) => {
    const path = tabs[selectedIndex].path;
    navigate(`/contests/${contestId}/${path}`);
  };

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
              selectedIndex={getCurrentTabIndex()} 
              onChange={handleTabChange}
            >
              <TabList aria-label="Contest navigation">
                {tabs.map((tab, index) => (
                  <Tab key={index}>{tab.label}</Tab>
                ))}
              </TabList>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContestTabs;
