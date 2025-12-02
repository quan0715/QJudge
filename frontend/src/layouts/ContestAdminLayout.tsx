import React from 'react';
import { Outlet, useParams, useNavigate, useLocation } from 'react-router-dom';
import { Button, Loading, Header, HeaderName, HeaderGlobalBar, HeaderGlobalAction, Theme, HeaderNavigation } from '@carbon/react';
import { Launch, UserAvatar, Light, Asleep } from '@carbon/icons-react';
import ContestHeroBase from '@/components/contest/layout/ContestHeroBase';
import ContestTabsBase from '@/components/contest/layout/ContestTabsBase';
import { useContest } from '@/hooks/useContest';
import { useTheme } from '@/contexts/ThemeContext';

const ContestAdminLayout: React.FC = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { contest, loading, refresh } = useContest(contestId);
  const { theme, toggleTheme } = useTheme();

  if (loading) return <Loading />;
  if (!contest) return <div>Contest not found</div>;

  // Admin Tabs
  const tabs = [
    { label: '總覽 (Overview)', path: '', key: 'overview' },
    { label: '設定 (Settings)', path: 'settings', key: 'settings' },
    { label: '題目 (Problems)', path: 'problems', key: 'problems' },
    { label: '參賽者 (Participants)', path: 'participants', key: 'participants' },
    { label: '紀錄 (Logs)', path: 'logs', key: 'logs' },
  ];

  const getCurrentTabIndex = () => {
    const currentPath = location.pathname.split(`/admin/contests/${contestId}/`)[1] || '';
    if (location.pathname === `/admin/contests/${contestId}` || location.pathname === `/admin/contests/${contestId}/`) {
      return 0;
    }
    const index = tabs.findIndex(tab => tab.path !== '' && currentPath.startsWith(tab.path));
    return index !== -1 ? index : 0;
  };

  const handleTabChange = (index: number) => {
    const path = tabs[index].path;
    navigate(`/admin/contests/${contestId}/${path}`);
  };

  // Calculate progress (same logic as ContestHero)
  const now = new Date().getTime();
  const start = new Date(contest.start_time).getTime();
  const end = new Date(contest.end_time).getTime();
  const total = end - start;
  const elapsed = now - start;
  let progress = 0;
  if (now > end) progress = 100;
  else if (now > start) progress = Math.min(100, Math.max(0, (elapsed / total) * 100));

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Theme theme={theme}>
        <Header aria-label="Contest Admin Platform">
          <HeaderName href="#" prefix="NYCU">
            Online Judge - Admin
          </HeaderName>
          <HeaderNavigation aria-label="Contest Navigation" />
          <HeaderGlobalBar>
            <HeaderGlobalAction 
              aria-label={theme === 'white' ? 'Switch to Dark Mode' : 'Switch to Light Mode'} 
              tooltipAlignment="center"
              onClick={toggleTheme}
            >
              {theme === 'white' ? <Asleep size={20} /> : <Light size={20} />}
            </HeaderGlobalAction>
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 1rem', borderLeft: '1px solid var(--cds-border-subtle)', height: '100%' }}>
              <UserAvatar size={20} />
            </div>
          </HeaderGlobalBar>
        </Header>
      </Theme>

      <Theme theme={theme} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ 
          marginTop: '3rem', 
          flex: 1, 
          overflow: 'auto', 
          backgroundColor: theme === 'white' ? '#f4f4f4' : '#161616' 
        }}>
          <ContestHeroBase
            contest={contest}
            progress={progress}
            actions={
              <Button 
                kind="ghost" 
                renderIcon={Launch} 
                onClick={() => navigate(`/contests/${contestId}`)}
              >
                前往前台 (View as User)
              </Button>
            }
            bottomContent={
              <ContestTabsBase
                items={tabs.map(t => ({ label: t.label, key: t.key }))}
                selectedIndex={getCurrentTabIndex()}
                onChange={handleTabChange}
              />
            }
          />
          <div style={{ padding: '2rem' }}>
            <Outlet context={{ contest, refreshContest: refresh }} />
          </div>
        </div>
      </Theme>
    </div>
  );
};

export default ContestAdminLayout;
