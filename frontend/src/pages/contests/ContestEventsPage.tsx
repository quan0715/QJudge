import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  TableToolbarAction,
  Pagination,
  Tag,
  Loading
} from '@carbon/react';
import { Renew } from '@carbon/icons-react';
import { api } from '@/services/api';

interface ContestActivity {
  id: string;
  username: string;
  action_type: string;
  details: string;
  created_at: string;
}

const ContestEventsPage = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<ContestActivity[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    if (contestId) {
      loadEvents();
    }
  }, [contestId]);

  const loadEvents = async () => {
    try {
      setLoading(true);
      const data = await api.getContestActivities(contestId!);
      let eventsData = [];
      if (Array.isArray(data)) {
        eventsData = data;
      } else if (data && typeof data === 'object' && 'results' in data) {
        eventsData = (data as any).results;
      }
      
      // Ensure IDs are strings for DataTable
      const formattedData = eventsData.map((item: any) => ({
        ...item,
        id: item.id.toString()
      }));
      setEvents(formattedData);
    } catch (error) {
      console.error('Failed to load events', error);
    } finally {
      setLoading(false);
    }
  };

  const headers = [
    { key: 'created_at', header: '時間' },
    { key: 'username', header: '使用者' },
    { key: 'action_type', header: '動作' },
    { key: 'details', header: '詳細內容' },
  ];

  const getActionTag = (action: string) => {
    switch (action) {
      case 'register': return <Tag type="green">註冊</Tag>;
      case 'start_exam': return <Tag type="blue">開始考試</Tag>;
      case 'end_exam': return <Tag type="gray">結束考試</Tag>;
      case 'lock_user': return <Tag type="red">鎖定</Tag>;
      case 'unlock_user': return <Tag type="teal">解鎖</Tag>;
      case 'submit_code': return <Tag type="purple">提交</Tag>;
      case 'ask_question': return <Tag type="cyan">提問</Tag>;
      case 'reply_question': return <Tag type="cyan">回覆</Tag>;
      case 'announce': return <Tag type="magenta">公告</Tag>;
      default: return <Tag type="outline">{action}</Tag>;
    }
  };

  // Simple client-side pagination for now
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const currentEvents = events.slice(startIndex, endIndex);

  if (loading && events.length === 0) return <Loading />;

  return (
    <div className="cds--grid" style={{ padding: '2rem' }}>
      <div className="cds--row">
        <div className="cds--col-lg-16">
          <DataTable rows={currentEvents} headers={headers}>
            {({
              rows,
              headers,
              getHeaderProps,
              getRowProps,
              getTableProps,
              onInputChange
            }: any) => (
              <TableContainer title="考試事件紀錄" description="記錄所有競賽相關的操作與事件">
                <TableToolbar>
                  <TableToolbarContent>
                    <TableToolbarSearch onChange={onInputChange} />
                    {/* @ts-ignore */}
                    <TableToolbarAction onClick={loadEvents} renderIcon={Renew} iconDescription="重新整理" />
                  </TableToolbarContent>
                </TableToolbar>
                <Table {...getTableProps()}>
                  <TableHead>
                    <TableRow>
                      {headers.map((header: any) => (
                        <TableHeader {...getHeaderProps({ header })}>
                          {header.header}
                        </TableHeader>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((row: any) => {
                      const event = events.find(e => e.id.toString() === row.id);
                      return (
                        <TableRow {...getRowProps({ row })}>
                          <TableCell>{new Date(event?.created_at || '').toLocaleString()}</TableCell>
                          <TableCell>{event?.username}</TableCell>
                          <TableCell>{getActionTag(event?.action_type || '')}</TableCell>
                          <TableCell>{event?.details}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </DataTable>
          <Pagination
            totalItems={events.length}
            pageSize={pageSize}
            pageSizes={[10, 20, 50, 100]}
            onChange={({ page, pageSize }) => {
              setPage(page);
              setPageSize(pageSize);
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default ContestEventsPage;
