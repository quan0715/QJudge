import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Grid,
  Column,
  Loading,
  Tile
} from '@carbon/react';
import { ArrowRight, User, Folder } from '@carbon/icons-react';
import { getContestParticipants, getExamEvents } from '@/services/contest';
import type { ExamEvent } from '@/core/entities/contest.entity';
import { mapExamEventDto } from '@/core/entities/mappers/contestMapper';
import { useContest } from '@/domains/contest/contexts/ContestContext';

import ContainerCard from '@/ui/components/layout/ContainerCard';

const ContestAdminOverview = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const { contest, loading: contestLoading } = useContest();

  const [loading, setLoading] = useState(true);
  const [participantCount, setParticipantCount] = useState(0);
  const [recentEvents, setRecentEvents] = useState<ExamEvent[]>([]);

  useEffect(() => {
    if (contestId) {
      loadData();
    }
  }, [contestId]);

  const loadData = async () => {
    if (!contestId) return;
    try {
      setLoading(true);
      const [participantsData, eventsData] = await Promise.all([
        getContestParticipants(contestId),
        getExamEvents(contestId)
      ]);
      
      setParticipantCount(participantsData.length);
      
      const mappedEvents = eventsData.map(mapExamEventDto);
      mappedEvents.sort((a: ExamEvent, b: ExamEvent) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setRecentEvents(mappedEvents.slice(0, 5));

    } catch (error) {
      console.error('Failed to load dashboard data', error);
    } finally {
      setLoading(false);
    }
  };



  if (loading || contestLoading) return <Loading />;
  if (!contest) return <div>Contest not found</div>;

  return (
    <div className="contest-admin-overview">

      
      <div style={{ padding: '1rem', maxWidth: '1056px', margin: '0 auto', width: '100%' }}>
        <Grid>
            {/* Quick Stats */}
            <Column lg={4} md={4} sm={4}>
                <Tile style={{ height: '100%', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
                        <div>
                            <h4 style={{ marginBottom: '0.5rem', fontWeight: 600 }}>{participantCount}</h4>
                            <div style={{ color: 'var(--cds-text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <User /> 參賽者
                            </div>
                        </div>
                        <div style={{ marginTop: '1rem' }}>
                            <Link to="participants" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                管理參賽者 <ArrowRight />
                            </Link>
                        </div>
                    </div>
                </Tile>
            </Column>
            <Column lg={4} md={4} sm={4}>
                <Tile style={{ height: '100%', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
                        <div>
                            <h4 style={{ marginBottom: '0.5rem', fontWeight: 600 }}>{contest.problems?.length || 0}</h4>
                            <div style={{ color: 'var(--cds-text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Folder /> 題目數量
                            </div>
                        </div>
                        <div style={{ marginTop: '1rem' }}>
                            <Link to="problems" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                管理題目 <ArrowRight />
                            </Link>
                        </div>
                    </div>
                </Tile>
            </Column>
            <Column lg={8} md={8} sm={4}>
                <Tile style={{ height: '100%', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
                         <div>
                            <h6 style={{ marginBottom: '0.5rem', color: 'var(--cds-text-secondary)' }}>競賽時間</h6>
                            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                                <div>
                                    <div style={{ fontSize: '0.875rem' }}>開始時間</div>
                                    <div style={{ fontWeight: 600, fontSize: '1.25rem' }}>
                                        {new Date(contest.startTime).toLocaleString()}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.875rem' }}>結束時間</div>
                                    <div style={{ fontWeight: 600, fontSize: '1.25rem' }}>
                                        {new Date(contest.endTime).toLocaleString()}
                                    </div>
                                </div>
                            </div>
                        </div>
                         <div style={{ marginTop: '1rem' }}>
                            <Link to="settings" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                修改設定 <ArrowRight />
                            </Link>
                        </div>
                    </div>
                </Tile>
            </Column>

            {/* Recent Activity */}
            <Column lg={16} md={8} sm={4}>
                <ContainerCard title="最近活動 (Recent Activity)" noPadding>
                    <div className="recent-activity-list">
                        {recentEvents.length === 0 ? (
                            <div style={{ padding: '1rem', color: 'var(--cds-text-secondary)' }}>
                                尚無活動紀錄
                            </div>
                        ) : (
                            recentEvents.map((event, index) => (
                                <div 
                                    key={index} 
                                    style={{ 
                                        padding: '1rem', 
                                        borderBottom: index < recentEvents.length - 1 ? '1px solid var(--cds-border-subtle)' : 'none',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}
                                >
                                    <div>
                                        <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                                            {event.userName} - {event.eventType}
                                        </div>
                                        <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
                                            {event.reason}
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
                                        {new Date(event.timestamp).toLocaleString()}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    {recentEvents.length > 0 && (
                        <div style={{ padding: '1rem', borderTop: '1px solid var(--cds-border-subtle)' }}>
                             <Link to="logs" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                查看所有紀錄 <ArrowRight />
                            </Link>
                        </div>
                    )}
                </ContainerCard>
            </Column>
        </Grid>
      </div>
    </div>
  );
};

export default ContestAdminOverview;
