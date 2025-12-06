import { useEffect, useState } from 'react';
import { Grid, Column, Tile, ClickableTile, ProgressBar, Tag
} from '@carbon/react';
import { Launch, Education, ArrowRight } from '@carbon/icons-react';
import { Link } from 'react-router-dom';
import { api } from '@/services/api';
import { announcementService } from '@/services/announcementService';
import type { Announcement } from '@/services/announcementService';

interface User {
  username: string;
  role: string;
}

interface UserStats {
  total_solved: number;
  total_easy: number;
  total_medium: number;
  total_hard: number;
  easy_solved: number;
  medium_solved: number;
  hard_solved: number;
}

const DashboardPage = () => {
  const [user] = useState<User | null>(() => {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  });
  const [stats, setStats] = useState<UserStats | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    if (!user) return; // Optional: Only fetch if user logs in, or maybe kept as is if stats are public? Assuming stats are per user.


    const fetchStats = async () => {
        try {
            const data = await api.getUserStats();
            setStats(data);
        } catch (err) {
            console.error('Failed to fetch stats', err);
        }
    };
    
    const fetchAnnouncements = async () => {
        try {
            const data = await announcementService.getAll();
            const visibleAnnouncements = data.filter(a => a.visible);
            setAnnouncements(visibleAnnouncements.slice(0, 5)); // Show top 5 visible
        } catch (err) {
            console.error('Failed to fetch announcements', err);
        }
    };

    fetchStats();
    fetchAnnouncements();
  }, [user]);

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

      {/* Announcements Information */}
      <Column lg={16} md={8} sm={4} style={{ marginTop: '3rem' }}>
         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ marginBottom: 0 }}>Announcements</h3>
             <Link to="/announcements" style={{ fontSize: '1rem', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
                  View All <ArrowRight size={16} style={{ marginLeft: '0.5rem' }} />
             </Link>
         </div>
      </Column>

      {/* Author's Announcement */}
      <Column lg={16} md={8} sm={4} style={{ marginBottom: '1rem' }}>
        <Tile className="glass-panel" style={{ 
            background: 'linear-gradient(135deg, var(--nycu-primary) 0%, #001d6c 100%)', 
            color: 'white',
            border: 'none',
            position: 'relative',
            overflow: 'hidden'
        }}>
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'flex-start', gap: '1.5rem' }}>
            <div style={{ 
                padding: '0.75rem', 
                background: 'rgba(255,255,255,0.15)', 
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center' 
            }}>
                <span role="img" aria-label="wave" style={{ fontSize: '1.75rem' }}>👋</span>
            </div>
            <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.75rem' }}>
                <h4 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                    Welcome to QJudge
                </h4>
                <Tag type="blue" style={{ margin: 0 }}>Author's Note</Tag>
                </div>
                <p style={{ opacity: 0.9, lineHeight: '1.6', fontSize: '1rem', marginBottom: '1rem', maxWidth: '800px' }}>
                Hi everyone, I'm Quan. I built QJudge to provide a modern, efficient platform for mastering algorithms. 
                Check out the latest problems and don't miss our weekly contests!
                </p>
                <div style={{ fontSize: '0.875rem', opacity: 0.8, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>— Quan, Creator of QJudge</span>
                </div>
            </div>
            </div>
            {/* Decorative circle */}
            <div style={{
            position: 'absolute',
            top: '-50%',
            right: '-10%',
            width: '300px',
            height: '300px',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '50%',
            pointerEvents: 'none'
            }} />
        </Tile>
      </Column>

      <Column lg={8} md={4} sm={4} style={{ marginBottom: '1rem' }}>
        <Tile style={{ height: '100%', borderLeft: '4px solid var(--nycu-primary)', transition: 'transform 0.2s' }} className="hover-lift">
            <h4 style={{ marginBottom: '0.5rem' }}>System Maintenance</h4>
            <p style={{ color: 'var(--cds-text-secondary)', marginBottom: '1rem' }}>Sunday, 10:00 PM - 12:00 AM</p>
            <p>The system will be undergoing scheduled maintenance to improve performance.</p>
        </Tile>
      </Column>

      {announcements.map((announcement) => (
        <Column lg={8} md={4} sm={4} style={{ marginBottom: '1rem' }} key={announcement.id}>
            <Tile style={{ height: '100%', borderLeft: '4px solid #f1c21b', transition: 'transform 0.2s' }} className="hover-lift">
                <h4 style={{ marginBottom: '0.5rem' }}>{announcement.title}</h4>
                <p style={{ color: 'var(--cds-text-secondary)', marginBottom: '1rem' }}>
                    {new Date(announcement.created_at).toLocaleDateString()}
                </p>
                <div style={{ 
                    display: '-webkit-box', 
                    WebkitLineClamp: 3, 
                    WebkitBoxOrient: 'vertical', 
                    overflow: 'hidden' 
                }}>
                    {announcement.content}
                </div>
            </Tile>
        </Column>
      ))}
    </Grid>
  );
};

export default DashboardPage;
