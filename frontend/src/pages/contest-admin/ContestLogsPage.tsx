import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { 
  Loading, 
  DataTable, 
  TableContainer, 
  Table, 
  TableHead, 
  TableRow, 
  TableHeader, 
  TableBody, 
  TableCell,
  Tag
} from '@carbon/react';
import { api } from '@/services/api';
import type { ContestDetail } from '@/models/contest';
import ContainerCard from '@/components/contest/layout/ContainerCard';

interface ContestAdminContext {
  contest: ContestDetail;
  refreshContest: () => void;
}

const ContestLogsPage: React.FC = () => {
  const { contest } = useOutletContext<ContestAdminContext>();
  
  const [examEvents, setExamEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (contest.id) {
      loadExamLogs();
    }
  }, [contest.id]);

  const loadExamLogs = async () => {
    if (!contest.id) return;
    setLoading(true);
    try {
      const data = await api.getExamEvents(contest.id.toString());
      setExamEvents(data);
    } catch (error) {
      console.error('Failed to load exam logs', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ContainerCard title="考試紀錄 (Exam Logs)" noPadding>
      {loading ? (
        <Loading withOverlay={false} />
      ) : (
        <DataTable
          rows={examEvents.map((e, i) => ({ ...e, id: e.id?.toString() || i.toString() }))}
          headers={[
            { key: 'user', header: '使用者' },
            { key: 'type', header: '事件類型' },
            { key: 'created_at', header: '時間' },
            { key: 'metadata', header: '詳細資訊' }
          ]}
        >
          {({ rows, headers, getHeaderProps, getRowProps, getTableProps }: any) => (
            <TableContainer>
              <Table {...getTableProps()}>
                <TableHead>
                  <TableRow>
                    {headers.map((header: any) => (
                      <TableHeader {...getHeaderProps({ header })} key={header.key}>
                        {header.header}
                      </TableHeader>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row: any) => {
                    const event = examEvents.find((e, i) => (e.id?.toString() || i.toString()) === row.id);
                    if (!event) return null;
                    return (
                      <TableRow {...getRowProps({ row })} key={row.id}>
                        <TableCell>{event.user?.username}</TableCell>
                        <TableCell>
                          <Tag type={event.type === 'violation' ? 'red' : 'gray'}>
                            {event.type}
                          </Tag>
                        </TableCell>
                        <TableCell>{new Date(event.created_at).toLocaleString('zh-TW')}</TableCell>
                        <TableCell>
                          {event.metadata && Object.keys(event.metadata).length > 0 ? (
                            <div style={{ fontSize: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              {Object.entries(event.metadata).map(([key, value]) => (
                                <div key={key} style={{ display: 'flex', gap: '0.5rem' }}>
                                  <span style={{ fontWeight: 600, color: 'var(--cds-text-secondary)' }}>{key}:</span>
                                  <span>{String(value)}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--cds-text-secondary)' }}>-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DataTable>
      )}
    </ContainerCard>
  );
};

export default ContestLogsPage;
