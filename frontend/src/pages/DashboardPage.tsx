import { useEffect, useState } from 'react';
import { Grid, Column, Tile, ClickableTile, ProgressBar } from '@carbon/react';
import { Launch, Education } from '@carbon/icons-react';
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
            <h4 style={{ color: 'var(--cds-text-secondary)', marginBottom: '0.5rem' }}>Welcome to QJudge</h4>
            <h1 style={{ fontSize: '3rem', fontWeight: 'bold' }}>
              Hi, <span style={{ color: 'var(--cds-link-primary)' }}>{user.username}</span>
            </h1>
            <p style={{ marginTop: '1rem', color: 'var(--cds-text-secondary)', fontSize: '1.1rem', maxWidth: '600px' }}>
              QJudge Portal - The ultimate platform to master algorithms, prepare for technical interviews, and compete in coding contests. Start your journey today!
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



      <Column lg={16} md={8} sm={4} style={{ marginTop: '2rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Progress Overview</h3>
        <Tile style={{ padding: '2rem' }}>
          {stats ? (
            <div style={{ display: 'flex', gap: '4rem', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
                {/* Circular Progress */}
                <div style={{ position: 'relative', width: '160px', height: '160px', flexShrink: 0 }}>
                    <svg viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)', width: '100%', height: '100%' }}>
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="var(--cds-ui-03)" strokeWidth="2" />
                        <path 
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
                            fill="none" 
                            stroke="#ffa116" 
                            strokeWidth="2" 
                            strokeDasharray={`${(stats.total_solved / (stats.total_easy + stats.total_medium + stats.total_hard || 1)) * 100}, 100`} 
                            strokeLinecap="round"
                        />
                    </svg>
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                        <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--cds-text-primary)' }}>{stats.total_solved}</div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>Solved</div>
                    </div>
                </div>
                
                {/* Breakdown */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '600px' }}>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', marginBottom: '0.5rem' }}>
                            <span style={{ color: '#00b8a3', fontWeight: '500' }}>Easy</span>
                            <span style={{ color: 'var(--cds-text-secondary)' }}>{stats.easy_solved} <span style={{ fontSize: '0.875rem', color: 'var(--cds-text-tertiary)' }}>/ {stats.total_easy}</span></span>
                        </div>
                        <ProgressBar value={stats.easy_solved} max={stats.total_easy} size="small" label="Easy" hideLabel className="leetcode-progress-easy" />
                        <style>{`.leetcode-progress-easy .cds--progress-bar__bar { background-color: #00b8a3; }`}</style>
                    </div>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', marginBottom: '0.5rem' }}>
                            <span style={{ color: '#ffc01e', fontWeight: '500' }}>Medium</span>
                            <span style={{ color: 'var(--cds-text-secondary)' }}>{stats.medium_solved} <span style={{ fontSize: '0.875rem', color: 'var(--cds-text-tertiary)' }}>/ {stats.total_medium}</span></span>
                        </div>
                        <ProgressBar value={stats.medium_solved} max={stats.total_medium} size="small" label="Medium" hideLabel className="leetcode-progress-medium" />
                        <style>{`.leetcode-progress-medium .cds--progress-bar__bar { background-color: #ffc01e; }`}</style>
                    </div>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', marginBottom: '0.5rem' }}>
                            <span style={{ color: '#ff375f', fontWeight: '500' }}>Hard</span>
                            <span style={{ color: 'var(--cds-text-secondary)' }}>{stats.hard_solved} <span style={{ fontSize: '0.875rem', color: 'var(--cds-text-tertiary)' }}>/ {stats.total_hard}</span></span>
                        </div>
                        <ProgressBar value={stats.hard_solved} max={stats.total_hard} size="small" label="Hard" hideLabel className="leetcode-progress-hard" />
                        <style>{`.leetcode-progress-hard .cds--progress-bar__bar { background-color: #ff375f; }`}</style>
                    </div>
                </div>
            </div>
          ) : (
             <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
                 Loading stats...
             </div>
          )}
        </Tile>
      </Column>
    </Grid>
  );
};

export default DashboardPage;
