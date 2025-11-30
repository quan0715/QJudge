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
import type { ExamEventStats } from '@/types/contest';
import { api } from '@/services/api';

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
      const events = await api.getExamEvents(contestId);
      
      // Aggregate events by user
      const userMap = new Map<string, ExamEventStats>();
      
      events.forEach((event: any) => {
        if (!userMap.has(event.user_id)) {
          userMap.set(event.user_id, {
            user_id: event.user_id,
            user_name: event.user_name || event.student_name || 'Unknown',
            tab_hidden_count: 0,
            window_blur_count: 0,
            exit_fullscreen_count: 0,
            total_violations: 0
          });
        }

        const userStats = userMap.get(event.user_id)!;
        
        switch (event.event_type) {
          case 'tab_hidden':
            userStats.tab_hidden_count++;
            break;
          case 'window_blur':
            userStats.window_blur_count++;
            break;
          case 'exit_fullscreen':
            userStats.exit_fullscreen_count++;
            break;
        }
        
        userStats.total_violations++;
      });

      setStats(Array.from(userMap.values()));
    } catch (error) {
      console.error('Failed to fetch exam event stats', error);
    } finally {
      setLoading(false);
    }
  };

  const headers = [
    { key: 'user_name', header: '參賽者' },
    { key: 'tab_hidden_count', header: '切換分頁' },
    { key: 'window_blur_count', header: '視窗失焦' },
    { key: 'exit_fullscreen_count', header: '退出全螢幕' },
    { key: 'total_violations', header: '總違規次數' }
  ];

  const rows = stats.map(stat => ({
    id: stat.user_id,
    user_name: stat.user_name,
    tab_hidden_count: stat.tab_hidden_count,
    window_blur_count: stat.window_blur_count,
    exit_fullscreen_count: stat.exit_fullscreen_count,
    total_violations: stat.total_violations
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
