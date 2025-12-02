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
    const actionMap: Record<string, { label: string; type: any }> = {
      'register': { label: '註冊', type: 'green' },
      'enter_contest': { label: '進入競賽', type: 'blue' },
      'start_exam': { label: '開始考試', type: 'cyan' },
      'end_exam': { label: '結束考試', type: 'magenta' },
      'lock_user': { label: '鎖定用戶', type: 'red' },
      'unlock_user': { label: '解鎖用戶', type: 'teal' },
      'submit_code': { label: '提交程式碼', type: 'purple' },
      'ask_question': { label: '提問', type: 'blue' },
      'reply_question': { label: '回覆提問', type: 'blue' },
      'update_problem': { label: '更新題目', type: 'gray' },
      'announce': { label: '發布公告', type: 'magenta' },
      'leave': { label: '離開競賽', type: 'gray' },
      'publish_problem_to_practice': { label: '發布到練習區', type: 'cool-gray' },
      'update_participant': { label: '更新參與者', type: 'gray' },
      'other': { label: '其他', type: 'outline' }
    };

    const config = actionMap[action] || { label: action, type: 'outline' };
    return <Tag type={config.type}>{config.label}</Tag>;
  };

  // Simple client-side pagination for now
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const currentEvents = events.slice(startIndex, endIndex);

  if (loading && events.length === 0) return <Loading />;

  return (
    <div className="cds--grid" style={{ padding: '0' }}>
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
              <TableContainer 
                title="考試事件紀錄" 
                description="記錄所有競賽相關的操作與事件"
                style={{
                  backgroundColor: 'var(--cds-background)',
                  padding: '1rem',
                  marginTop: '1rem'
                }}
              >
                <TableToolbar>
                  <TableToolbarContent>
                    <TableToolbarSearch onChange={onInputChange} placeholder="搜尋事件..." />
                    {/* @ts-ignore */}
                    <TableToolbarAction onClick={loadEvents} renderIcon={Renew} iconDescription="重新整理" />
                  </TableToolbarContent>
                </TableToolbar>
                <Table {...getTableProps()}>
                  <TableHead>
                    <TableRow>
                      {headers.map((header: any) => {
                        const { key, ...headerProps } = getHeaderProps({ header });
                        return (
                          <TableHeader {...headerProps} key={key}>
                            {header.header}
                          </TableHeader>
                        );
                      })}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((row: any) => {
                      const event = events.find(e => e.id.toString() === row.id);
                      const { key, ...rowProps } = getRowProps({ row });
                      return (
                        <TableRow {...rowProps} key={key}>
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
