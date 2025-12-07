import { useState, useEffect } from 'react';
import { Grid, Column, Tile, SkeletonText, Tag } from '@carbon/react';
import { Calendar, Trophy, DocumentMultiple_02, CheckmarkOutline } from '@carbon/icons-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/ui/layout/PageHeader';
import { getUserStats } from '@/services/auth';
import { getAnnouncements, type Announcement } from '@/services/announcement';
import { getContests } from '@/services/contest';
import type { Contest } from '@/core/entities/contest.entity';
import { useAuth } from '@/domains/auth/contexts/AuthContext';

interface UserStats {
  total_solved: number;
  easy_solved: number;
  medium_solved: number;
  hard_solved: number;
  total_easy: number;
  total_medium: number;
  total_hard: number;
}

const DashboardPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsData, announcementsData, contestsData] = await Promise.all([
          getUserStats().catch(() => null),
          getAnnouncements().catch(() => []),
          getContests().catch(() => [])
        ]);
        
        setStats(statsData);
        setAnnouncements(announcementsData.filter((a: Announcement) => a.visible).slice(0, 5));
        
        // Filter upcoming or ongoing contests
        const now = new Date();
        const activeContests = contestsData.filter((c: Contest) => {
          const endTime = new Date(c.endTime);
          return endTime > now;
        }).slice(0, 5);
        setContests(activeContests);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const getContestStatus = (contest: Contest) => {
    const now = new Date();
    const startTime = new Date(contest.startTime);
    const endTime = new Date(contest.endTime);
    
    if (now < startTime) return { label: '即將開始', kind: 'blue' as const };
    if (now >= startTime && now <= endTime) return { label: '進行中', kind: 'green' as const };
    return { label: '已結束', kind: 'gray' as const };
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('zh-TW', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <>
      <PageHeader
        title={`歡迎回來，${user?.username || '用戶'}`}
        subtitle="NYCU Online Judge"
      />
      <Grid style={{ padding: '2rem 0' }}>
        {/* User Stats Section */}
        <Column lg={8} md={8} sm={4} style={{ marginBottom: '1.5rem' }}>
          <Tile style={{ height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
              <CheckmarkOutline size={24} style={{ marginRight: '0.5rem' }} />
              <h4 style={{ margin: 0 }}>解題統計</h4>
            </div>
            {loading ? (
              <SkeletonText paragraph lineCount={4} />
            ) : stats ? (
              <div>
                <div style={{ fontSize: '2.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>
                  {stats.total_solved}
                  <span style={{ fontSize: '1rem', fontWeight: 'normal', color: 'var(--cds-text-secondary)' }}>
                    {' '}/ {stats.total_easy + stats.total_medium + stats.total_hard} 題
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--cds-layer-02)', borderRadius: '4px', flex: 1, minWidth: '80px' }}>
                    <div style={{ color: '#22c55e', fontWeight: 'bold' }}>Easy</div>
                    <div>{stats.easy_solved} / {stats.total_easy}</div>
                  </div>
                  <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--cds-layer-02)', borderRadius: '4px', flex: 1, minWidth: '80px' }}>
                    <div style={{ color: '#f59e0b', fontWeight: 'bold' }}>Medium</div>
                    <div>{stats.medium_solved} / {stats.total_medium}</div>
                  </div>
                  <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--cds-layer-02)', borderRadius: '4px', flex: 1, minWidth: '80px' }}>
                    <div style={{ color: '#ef4444', fontWeight: 'bold' }}>Hard</div>
                    <div>{stats.hard_solved} / {stats.total_hard}</div>
                  </div>
                </div>
              </div>
            ) : (
              <p style={{ color: 'var(--cds-text-secondary)' }}>無法載入統計資料</p>
            )}
          </Tile>
        </Column>

        {/* Recent Contests Section */}
        <Column lg={8} md={8} sm={4} style={{ marginBottom: '1.5rem' }}>
          <Tile style={{ height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
              <Trophy size={24} style={{ marginRight: '0.5rem' }} />
              <h4 style={{ margin: 0 }}>近期比賽</h4>
            </div>
            {loading ? (
              <SkeletonText paragraph lineCount={4} />
            ) : contests.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {contests.map((contest) => {
                  const status = getContestStatus(contest);
                  return (
                    <div
                      key={contest.id}
                      onClick={() => navigate(`/contests/${contest.id}`)}
                      style={{
                        padding: '0.75rem',
                        backgroundColor: 'var(--cds-layer-02)',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 500 }}>{contest.name}</div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Calendar size={14} />
                          {formatDate(contest.startTime)}
                        </div>
                      </div>
                      <Tag type={status.kind} size="sm">{status.label}</Tag>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ color: 'var(--cds-text-secondary)' }}>目前沒有近期比賽</p>
            )}
          </Tile>
        </Column>

        {/* Announcements Section */}
        <Column lg={16} md={8} sm={4}>
          <Tile>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
              <DocumentMultiple_02 size={24} style={{ marginRight: '0.5rem' }} />
              <h4 style={{ margin: 0 }}>公告</h4>
            </div>
            {loading ? (
              <SkeletonText paragraph lineCount={3} />
            ) : announcements.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {announcements.map((announcement) => (
                  <div
                    key={announcement.id}
                    style={{
                      padding: '1rem',
                      backgroundColor: 'var(--cds-layer-02)',
                      borderRadius: '4px',
                      borderLeft: '4px solid var(--cds-link-primary)'
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{announcement.title}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', marginBottom: '0.5rem' }}>
                      {announcement.content.length > 200 
                        ? announcement.content.substring(0, 200) + '...' 
                        : announcement.content}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-helper)' }}>
                      {announcement.author?.username} • {formatDate(announcement.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--cds-text-secondary)' }}>目前沒有公告</p>
            )}
          </Tile>
        </Column>
      </Grid>
    </>
  );
};

export default DashboardPage;
