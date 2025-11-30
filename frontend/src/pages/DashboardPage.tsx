import { useEffect, useState } from 'react';
import { Grid, Column, Tile, Button, ClickableTile, ProgressBar } from '@carbon/react';
import { Launch, Education, Bullhorn } from '@carbon/icons-react';
import { api } from '@/services/api';

interface User {
  username: string;
  role: string;
}

const DashboardPage = () => {
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      setUser(JSON.parse(userStr));
    }

    const fetchStats = async () => {
        try {
            const data = await api.getUserStats();
            setStats(data);
        } catch (err) {
            console.error('Failed to fetch stats', err);
        }
    };
    fetchStats();
  }, []);

  if (!user) return null;

  return (
    <Grid className="dashboard-page" fullWidth style={{ padding: '2rem' }}>
      {/* Hero Section */}
      <Column lg={16} md={8} sm={4} style={{ marginBottom: '3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--cds-ui-03)', paddingBottom: '2rem' }}>
          <div>
            <h4 style={{ color: 'var(--cds-text-secondary)', marginBottom: '0.5rem' }}>Welcome Back</h4>
            <h1 style={{ fontSize: '3rem', fontWeight: 'bold' }}>
              Hi, <span style={{ color: 'var(--cds-link-primary)' }}>{user.username}</span>
            </h1>
            <p style={{ marginTop: '1rem', color: 'var(--cds-text-secondary)' }}>
              NYCU Online Judge Portal
            </p>
          </div>
          <div className="cds--visible-md">
            {/* Placeholder for illustration */}
            <Education size={128} style={{ opacity: 0.1 }} />
          </div>
        </div>
      </Column>

      {/* Common Links */}
      <Column lg={16} md={8} sm={4} style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Quick Links</h3>
      </Column>
      
      <Column lg={5} md={4} sm={4} style={{ marginBottom: '1rem' }}>
        <ClickableTile href="/problems" style={{ height: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h4>Problem Set</h4>
              <p style={{ marginTop: '0.5rem', color: 'var(--cds-text-secondary)' }}>Practice coding problems</p>
            </div>
            <Launch />
          </div>
        </ClickableTile>
      </Column>
      
      <Column lg={5} md={4} sm={4} style={{ marginBottom: '1rem' }}>
        <ClickableTile href="/contests" style={{ height: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h4>Contests</h4>
              <p style={{ marginTop: '0.5rem', color: 'var(--cds-text-secondary)' }}>Join competitive exams</p>
            </div>
            <Launch />
          </div>
        </ClickableTile>
      </Column>
      
      <Column lg={6} md={4} sm={4} style={{ marginBottom: '1rem' }}>
        <ClickableTile href="/status" style={{ height: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h4>Submission Status</h4>
              <p style={{ marginTop: '0.5rem', color: 'var(--cds-text-secondary)' }}>Check your results</p>
            </div>
            <Launch />
          </div>
        </ClickableTile>
      </Column>

      {/* Announcements & Schedule Split */}
      <Column lg={10} md={8} sm={4} style={{ marginTop: '2rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Recent Announcements</h3>
        <Tile>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ padding: '1rem', borderBottom: i < 3 ? '1px solid var(--cds-ui-03)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <Bullhorn size={16} />
                  <span style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>2025-11-{20+i}</span>
                </div>
                <h5 style={{ fontWeight: 'bold' }}>System Maintenance Notice #{i}</h5>
                <p style={{ marginTop: '0.5rem' }}>The system will undergo scheduled maintenance...</p>
              </div>
            ))}
          </div>
          <Button kind="ghost" style={{ width: '100%', marginTop: '1rem' }}>View All Announcements</Button>
        </Tile>
      </Column>

      <Column lg={6} md={8} sm={4} style={{ marginTop: '2rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>My Stats</h3>
        <Tile style={{ height: 'calc(100% - 3rem)' }}>
          {stats ? (
            <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', height: '100%' }}>
                {/* Circular Progress */}
                <div style={{ position: 'relative', width: '120px', height: '120px', flexShrink: 0 }}>
                    <svg viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)', width: '100%', height: '100%' }}>
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="var(--cds-ui-03)" strokeWidth="3" />
                        <path 
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
                            fill="none" 
                            stroke="var(--cds-interactive-01)" 
                            strokeWidth="3" 
                            strokeDasharray={`${(stats.total_solved / (stats.total_easy + stats.total_medium + stats.total_hard || 1)) * 100}, 100`} 
                        />
                    </svg>
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                        <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stats.total_solved}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>Solved</div>
                    </div>
                </div>
                
                {/* Breakdown */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                            <span style={{ color: '#24a148' }}>Easy</span>
                            <span style={{ color: 'var(--cds-text-secondary)' }}>{stats.easy_solved} <span style={{ fontSize: '0.75rem' }}>/ {stats.total_easy}</span></span>
                        </div>
                        <ProgressBar value={stats.easy_solved} max={stats.total_easy} size="small" label="Easy" hideLabel status="active" />
                    </div>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                            <span style={{ color: '#f1c21b' }}>Medium</span>
                            <span style={{ color: 'var(--cds-text-secondary)' }}>{stats.medium_solved} <span style={{ fontSize: '0.75rem' }}>/ {stats.total_medium}</span></span>
                        </div>
                        <ProgressBar value={stats.medium_solved} max={stats.total_medium} size="small" label="Medium" hideLabel status="active" />
                    </div>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                            <span style={{ color: '#da1e28' }}>Hard</span>
                            <span style={{ color: 'var(--cds-text-secondary)' }}>{stats.hard_solved} <span style={{ fontSize: '0.75rem' }}>/ {stats.total_hard}</span></span>
                        </div>
                        <ProgressBar value={stats.hard_solved} max={stats.total_hard} size="small" label="Hard" hideLabel status="active" />
                    </div>
                </div>
            </div>
          ) : (
             <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                 Loading stats...
             </div>
          )}
        </Tile>
      </Column>
    </Grid>
  );
};

export default DashboardPage;
