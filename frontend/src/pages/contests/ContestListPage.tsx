import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Tag,
  Loading,
  Button,
  Modal,
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Tabs,
  Tab,
  TabList,
  TabPanels,
  TabPanel
} from '@carbon/react';
import { Add } from '@carbon/icons-react';
import { api } from '@/services/api';
import type { Contest } from '@/core/entities/contest.entity';
import { mapContestDto } from '@/core/entities/mappers/contestMapper';
import TeacherContestList from '@/components/contest/TeacherContestList';
import { getContestState, getContestStateColor, getContestStateLabel } from '@/utils/contest';

const ContestListPage = () => {
  const navigate = useNavigate();
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Generic Notification Modal
  const [notificationModal, setNotificationModal] = useState({
    open: false,
    title: '',
    message: '',
    kind: 'info' as 'info' | 'error' | 'warning'
  });

  useEffect(() => {
    const fetchContests = async () => {
      try {
        const rawData = await api.getContests();
        setContests(rawData.map(mapContestDto));
      } catch (error) {
        console.error('Failed to fetch contests', error);
      } finally {
        setLoading(false);
      }
    };
    fetchContests();
  }, []);

  const handleContestClick = async (contest: Contest) => {

    // Direct entry logic - no modal confirmation
    if (contest.isRegistered) {
      try {
        // Call enter contest API to register entry time/status
        await api.enterContest(contest.id);
        navigate(`/contests/${contest.id}`);
      } catch (err: any) {
        // If error (e.g. network), show notification but still try to navigate if it's just a state issue
        // Or handle specific errors if needed. For now, just show error.
        setNotificationModal({
          open: true,
          title: '錯誤',
          message: err.message || '無法進入競賽',
          kind: 'error'
        });
      }
    } else {
      // If not registered, navigate to contest page (which shows overview)
      navigate(`/contests/${contest.id}`);
    }
  };


  const headers = [
    { key: 'name', header: '競賽名稱' },
    { key: 'status', header: '狀態' },
    { key: 'time', header: '時間' },
    { key: 'userStatus', header: '您的狀態' },
    { key: 'type', header: '類型' },
  ];

  const renderTable = (filteredContests: Contest[]) => {
    const rows = filteredContests.map(c => {
      return {
        id: c.id,
        name: (
          <div style={{ fontWeight: 500, fontSize: '1rem' }}>
            {c.name}
          </div>
        ),
        status: (
          <Tag type={getContestStateColor(getContestState(c))}>
            {getContestStateLabel(getContestState(c))}
          </Tag>
        ),
        time: (
          <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
            {new Date(c.startTime).toLocaleString()} ~ {new Date(c.endTime).toLocaleString()}
          </div>
        ),
        userStatus: (
          <div>
            {/* Note: hasLeft is not in Contest entity yet, assuming it might be added or using hasJoined/isRegistered */}
            {c.isRegistered ? (
              <Tag type="teal">已報名</Tag>
            ) : (
              <Tag type="gray">未報名</Tag>
            )}
          </div>
        ),
        type: c.visibility === 'private' ? <Tag type="purple">私人競賽</Tag> : <Tag type="cool-gray">公開</Tag>
      };
    });

    return (
      <DataTable rows={rows} headers={headers}>
        {({ rows, headers, getHeaderProps, getTableProps }) => (
          <TableContainer 
            title="" 
            description=""
            style={{ 
              backgroundColor: 'transparent',
              padding: '0',
              boxShadow: 'none'
            }}
          >
            <Table {...getTableProps()}>
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
                {rows.map((row) => (
                  <TableRow 
                    key={row.id}
                    onClick={() => handleContestClick(contests.find(c => c.id === row.id)!)}
                    style={{ cursor: 'pointer' }}
                  >
                    {row.cells.map((cell) => (
                      <TableCell key={cell.id}>{cell.value}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>
    );
  };

  const userStr = localStorage.getItem('user');
  let isPrivileged = false;
  try {
    const user = JSON.parse(userStr || '{}');
    isPrivileged = user.role === 'admin' || user.role === 'teacher';
  } catch (e) {
    console.error('Failed to parse user', e);
  }

  // Filter contests:
  // 1. Privileged users see all.
  // 2. Regular users only see 'active' contests.
  const visibleContests = contests.filter(c => isPrivileged || c.status === 'active');

  const activeContests = visibleContests.filter(c => c.status !== 'archived');
  const archivedContests = visibleContests.filter(c => c.status === 'archived');
  const registeredContests = contests.filter(c => c.isRegistered);

  const renderEmptyState = (message: string) => (
    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--cds-text-secondary)' }}>
      <p style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>{message}</p>
    </div>
  );

  if (loading) return <Loading />;

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 300, marginBottom: '0.5rem' }}>競賽列表</h1>
          <p style={{ color: 'var(--cds-text-secondary)' }}>
            參加競賽，與其他同學切磋程式解題技巧。
          </p>
        </div>
        {(() => {
          const userStr = localStorage.getItem('user');
          try {
            const user = JSON.parse(userStr || '{}');
            const isPrivileged = user.role === 'admin' || user.role === 'teacher';
            if (isPrivileged) {
              return (
                <Button renderIcon={Add} onClick={() => navigate('/contests/new')}>
                  建立競賽
                </Button>
              );
            }
          } catch (e) {
            console.error('Failed to parse user', e);
          }
          return null;
        })()}
      </div>

      <Tabs>
        <TabList aria-label="Contest types">
          <Tab>進行中 / 即將開始</Tab>
          <Tab>已報名</Tab>
          <Tab>已封存</Tab>
          {(() => {
            const userStr = localStorage.getItem('user');
            try {
              const user = JSON.parse(userStr || '{}');
              if (user.role === 'admin' || user.role === 'teacher') {
                return <Tab>我的競賽</Tab>;
              }
            } catch {}
            return null;
          })()}
        </TabList>
        <TabPanels>
          <TabPanel>
            {activeContests.length > 0 ? renderTable(activeContests) : renderEmptyState('目前並沒有可報名的競賽')}
          </TabPanel>
          <TabPanel>
            {registeredContests.length > 0 ? renderTable(registeredContests) : renderEmptyState('您尚未報名任何競賽')}
          </TabPanel>
          <TabPanel>
            {archivedContests.length > 0 ? renderTable(archivedContests) : renderEmptyState('沒有已封存的競賽')}
          </TabPanel>
          {(() => {
            const userStr = localStorage.getItem('user');
            try {
              const user = JSON.parse(userStr || '{}');
              if (user.role === 'admin' || user.role === 'teacher') {
                return (
                  <TabPanel>
                    <TeacherContestList />
                  </TabPanel>
                );
              }
            } catch {}
            return null;
          })()}
        </TabPanels>
      </Tabs>

      {/* Generic Notification Modal */}
      <Modal
        open={notificationModal.open}
        modalHeading={notificationModal.title}
        passiveModal
        onRequestClose={() => setNotificationModal(prev => ({ ...prev, open: false }))}
      >
        <p style={{ 
          fontSize: '1rem', 
          color: notificationModal.kind === 'error' ? 'var(--cds-text-error)' : 'inherit' 
        }}>
          {notificationModal.message}
        </p>
      </Modal>
    </div>
  );
};

export default ContestListPage;
