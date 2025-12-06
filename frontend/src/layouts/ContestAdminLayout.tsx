import React from 'react';
import { Outlet, useParams, useNavigate, useLocation } from 'react-router-dom';
import { Button, Loading, Header, HeaderName, HeaderGlobalBar, HeaderGlobalAction, Theme, HeaderNavigation, Tag } from '@carbon/react';
import { Launch, UserAvatar, Light, Asleep, Time, UserMultiple, Catalog } from '@carbon/icons-react';
import { HeroBase } from '@/components/common/layout/HeroBase';
import ContestTabsBase from '@/components/contest/layout/ContestTabsBase';
import { ContestStatusBadge } from '@/components/common/badges/ContestStatusBadge';
import { useContest } from '@/hooks/useContest';
import { useTheme } from '@/contexts/ThemeContext';
import ReactMarkdown from 'react-markdown';

// Helper components (duplicated from ContestHero for now)
const DataCard = ({ icon: Icon, value, label }: { icon: React.ComponentType<any>, value: string | number, label: string }) => (
  <div style={{ 
    display: 'flex', 
    flexDirection: 'column', 
    padding: '0 2rem',
    borderLeft: '1px solid var(--cds-border-subtle)',
    minWidth: '140px',
    alignItems: 'flex-start'
  }}>
    <div style={{ marginBottom: '0.5rem', color: 'var(--cds-text-secondary)' }}>
      <Icon size={20} />
    </div>
    <div style={{ fontSize: '2.5rem', fontWeight: 300, lineHeight: 1, marginBottom: '0.25rem' }}>
      {value}
    </div>
    <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
      {label}
    </div>
  </div>
);

const MinimalProgressBar = ({ value, label, status }: { value: number, label?: string, status?: string }) => (
  <div style={{ width: '100%', marginTop: '0', marginBottom: '1.25rem' }}>
    {label && (
      <div style={{ 
        marginBottom: '0.5rem', 
        fontSize: '0.875rem', 
        color: 'var(--cds-text-secondary)',
        fontFamily: 'var(--cds-font-family)'
      }}>
        {label}
      </div>
    )}
    <div style={{ 
      height: '6px', 
      width: '100%', 
      backgroundColor: 'var(--cds-border-subtle)', 
      position: 'relative' 
    }}>
      <div style={{ 
        height: '100%', 
        width: `${value}%`, 
        backgroundColor: status === 'ended' || status === 'FINISHED' ? '#8d8d8d' : 'var(--cds-interactive)',
        transition: 'width 0.3s ease'
      }} />
    </div>
  </div>
);

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
    const currentPath = location.pathname.split(`/management/contests/${contestId}/`)[1] || '';
    if (location.pathname === `/management/contests/${contestId}` || location.pathname === `/management/contests/${contestId}/`) {
      return 0;
    }
    const index = tabs.findIndex(tab => tab.path !== '' && currentPath.startsWith(tab.path));
    return index !== -1 ? index : 0;
  };

  const handleTabChange = (index: number) => {
    const path = tabs[index].path;
    navigate(`/management/contests/${contestId}/${path}`);
  };

  // Calculate progress
  const now = new Date().getTime();
  const start = new Date(contest.startTime).getTime();
  const end = new Date(contest.endTime).getTime();
  const total = end - start;
  const elapsed = now - start;
  let progress = 0;
  if (now > end) progress = 100;
  else if (now > start) progress = Math.min(100, Math.max(0, (elapsed / total) * 100));


  // Prepare HeroBase props
  const startTime = new Date(contest.startTime);
  const endTime = new Date(contest.endTime);

  const getDuration = () => {
    const diff = end - start;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 24) return `${Math.floor(hours / 24)} Days`;
    if (minutes > 0) return `${hours}h ${minutes}m`;
    return `${hours}h`;
  };

  const formatDate = (date: Date) => {
    return date.toLocaleString('zh-TW', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const badges = (
    <>
      <ContestStatusBadge status={contest.status} />
      <Tag type={contest.visibility === 'public' ? 'green' : 'purple'}>
        {contest.visibility === 'public' ? '公開' : '私有'}
      </Tag>
      {contest.examModeEnabled && (
        <Tag type="red">考試模式</Tag>
      )}
    </>
  );

  const metadata = (
    <>
      <div>
        <div style={{ marginBottom: '0.25rem' }}>Start Time</div>
        <div style={{ color: 'var(--cds-text-primary)', fontWeight: 600 }}>{formatDate(startTime)}</div>
      </div>
      <div>
        <div style={{ marginBottom: '0.25rem' }}>End Time</div>
        <div style={{ color: 'var(--cds-text-primary)', fontWeight: 600 }}>{formatDate(endTime)}</div>
      </div>
    </>
  );

  const kpiCards = (
    <>
      <DataCard 
        icon={UserMultiple} 
        value={contest.participantCount || 0} 
        label="Participants" 
      />
      <DataCard 
        icon={Catalog} 
        value={contest.problems.length} 
        label="Problems" 
      />
      <DataCard 
        icon={Time} 
        value={getDuration()} 
        label="Duration" 
      />
    </>
  );

  const progressBar = (
    <MinimalProgressBar 
      value={progress} 
      label={contest.status === 'active' ? `Contest Progress · ${Math.round(progress)}%` : contest.status} 
      status={contest.status}
    />
  );

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
          <HeroBase
            title={contest.name}
            description={<ReactMarkdown>{contest.description || 'No description provided.'}</ReactMarkdown>}
            badges={badges}
            metadata={metadata}
            kpiCards={kpiCards}
            progressBar={progressBar}
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
