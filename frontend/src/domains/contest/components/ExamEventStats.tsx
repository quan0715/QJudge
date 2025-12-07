import { useState, useEffect } from 'react';
import {
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  InlineNotification
} from '@carbon/react';
import type { ExamEventStats } from '@/core/entities/contest.entity';
import { getExamEvents } from '@/services/contest';

interface ExamEventStatsProps {
  contestId: string;
}

const ExamEventStatsComponent: React.FC<ExamEventStatsProps> = ({ contestId }) => {
  const [stats, setStats] = useState<ExamEventStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [contestId]);

  const fetchStats = async () => {
    try {
      const events = await getExamEvents(contestId);
      
      // Aggregate events by user
      const userMap = new Map<string, ExamEventStats>();
      
      events.forEach((event: any) => {
        if (!userMap.has(event.user_id)) {
          userMap.set(event.user_id, {
            userId: event.user_id,
            userName: event.user_name || event.student_name || 'Unknown',
            tabHiddenCount: 0,
            windowBlurCount: 0,
            exitFullscreenCount: 0,
            totalViolations: 0
          });
        }

        const userStats = userMap.get(event.user_id)!;
        
        switch (event.event_type) {
          case 'tab_hidden':
            userStats.tabHiddenCount++;
            break;
          case 'window_blur':
            userStats.windowBlurCount++;
            break;
          case 'exit_fullscreen':
            userStats.exitFullscreenCount++;
            break;
        }
        
        userStats.totalViolations++;
      });

      setStats(Array.from(userMap.values()));
    } catch (error) {
      console.error('Failed to fetch exam event stats', error);
    } finally {
      setLoading(false);
    }
  };

  const headers = [
    { key: 'userName', header: '參賽者' },
    { key: 'tabHiddenCount', header: '切換分頁' },
    { key: 'windowBlurCount', header: '視窗失焦' },
    { key: 'exitFullscreenCount', header: '退出全螢幕' },
    { key: 'totalViolations', header: '總違規次數' }
  ];

  const rows = stats.map(stat => ({
    id: stat.userId,
    userName: stat.userName,
    tabHiddenCount: stat.tabHiddenCount,
    windowBlurCount: stat.windowBlurCount,
    exitFullscreenCount: stat.exitFullscreenCount,
    totalViolations: stat.totalViolations
  }));

  if (loading) {
    return <div>載入中...</div>;
  }

  if (stats.length === 0) {
    return (
      <InlineNotification
        kind="info"
        title="暫無事件記錄"
        subtitle="目前沒有記錄到任何考試違規事件"
        lowContrast
      />
    );
  }

  return (
    <DataTable rows={rows} headers={headers}>
      {({ rows, headers, getHeaderProps, getTableProps, getRowProps }) => (
        <TableContainer title="考試事件統計">
          <Table {...getTableProps()} size="md">
            <TableHead>
              <TableRow>
                {headers.map((header) => (
                  <TableHeader {...getHeaderProps({ header })} key={header.key}>
                    {header.header}
                  </TableHeader>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const hasViolations = parseInt(row.cells[4].value) > 0;
                return (
                  <TableRow
                    {...getRowProps({ row })}
                    key={row.id}
                    style={hasViolations ? { backgroundColor: 'var(--cds-layer-accent-01)' } : {}}
                  >
                    {row.cells.map((cell) => (
                      <TableCell key={cell.id}>{cell.value}</TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </DataTable>
  );
};

export default ExamEventStatsComponent;
