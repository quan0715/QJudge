import { useEffect, useState } from 'react';
import { Grid, Column, Tile, Button, ClickableTile } from '@carbon/react';
import { Launch, Education, Bullhorn } from '@carbon/icons-react';

interface User {
  username: string;
  role: string;
}

const DashboardPage = () => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      setUser(JSON.parse(userStr));
    }
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <p style={{ color: 'var(--cds-text-secondary)' }}>Problems Solved</p>
              <h1 style={{ fontSize: '3rem' }}>0</h1>
            </div>
            <div>
              <p style={{ color: 'var(--cds-text-secondary)' }}>Contest Rating</p>
              <h1 style={{ fontSize: '3rem' }}>-</h1>
            </div>
            <div>
              <p style={{ color: 'var(--cds-text-secondary)' }}>Global Rank</p>
              <h1 style={{ fontSize: '3rem' }}>-</h1>
            </div>
          </div>
        </Tile>
      </Column>
    </Grid>
  );
};

export default DashboardPage;
