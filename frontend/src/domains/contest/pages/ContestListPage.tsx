import React, { useState, useEffect } from 'react';
import { 
  Tabs, 
  TabList, 
  Tab, 
  TabPanels, 
  TabPanel,
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Button,
  Grid,
  Column,
  Tag,
  Modal,
  Loading
} from '@carbon/react';
import { useNavigate } from 'react-router-dom';
import { getContests, registerContest, enterContest } from '@/services/contest';
import { useAuth } from '@/domains/auth/contexts/AuthContext';
import type { Contest } from '@/core/entities/contest.entity';
import { PageHeader } from '@/ui/layout/PageHeader';
import TeacherContestList from '../components/TeacherContestList';

const ContestListPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [selectedContest, setSelectedContest] = useState<Contest | null>(null);
  const [password, setPassword] = useState('');

  // Generic Notification Modal
  const [notificationModal, setNotificationModal] = useState({
    open: false,
    title: '',
    message: '',
    kind: 'info' as 'info' | 'error' | 'warning'
  });

  useEffect(() => {
    fetchContests();
  }, []);

  const fetchContests = async () => {
    try {
      const data = await getContests();
      setContests(data);
    } catch (error) {
      console.error('Failed to fetch contests', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!selectedContest) return;
    try {
      await registerContest(selectedContest.id, password);
      // Refresh contests to update status
      fetchContests();
      setRegisterModalOpen(false);
      setPassword('');
      setSelectedContest(null);
    } catch (error) {
      setNotificationModal({
        open: true,
        title: '報名失敗',
        message: 'Registration failed',
        kind: 'error'
      });
    }
  };

  const handleEnter = async (contestId: string) => {
    try {
      await enterContest(contestId);
      navigate(`/contests/${contestId}`);
    } catch (error: any) {
        if (error.message.includes('Not registered')) {
           setNotificationModal({
             open: true,
             title: '尚未報名',
             message: 'Please register first',
             kind: 'warning'
           });
        } else {
           setNotificationModal({
             open: true,
             title: '無法進入',
             message: error.message,
             kind: 'error'
           });
        }
    }
  };

  const handleContestClick = async (contest: Contest) => {
    // Direct entry logic - no modal confirmation
    if (contest.isRegistered) { // Using standard entity property
      handleEnter(contest.id);
    } else {
      // If not registered, navigate to contest page (which shows overview)
      // OR open registration modal? Existing logic seemed to want to click row to enter/register
      if (!contest.isRegistered) {
          setSelectedContest(contest);
          setRegisterModalOpen(true);
      } else {
          navigate(`/contests/${contest.id}`);
      }
    }
  };

  const headers = [
    { key: 'name', header: '名稱' },
    { key: 'startTime', header: '開始時間' },
    { key: 'endTime', header: '結束時間' },
    { key: 'status', header: '狀態' },
    { key: 'userStatus', header: '您的狀態' },
    { key: 'action', header: '操作' },
  ];

  /* Processing logic for contest lists (ongoing, upcoming, past) */
  const now = new Date();
  
  const ongoingContests = contests.filter(c => {
      const start = new Date(c.startTime);
      const end = new Date(c.endTime);
      return start <= now && end >= now;
  });

  const upcomingContests = contests.filter(c => {
      const start = new Date(c.startTime);
      return start > now;
  });

  const pastContests = contests.filter(c => {
      const end = new Date(c.endTime);
      return end < now;
  });


  /* Render Helpers */
  const renderContestTable = (data: Contest[]) => (
      <DataTable rows={data.map((c: any) => ({ ...c, id: c.id.toString() }))} headers={headers}>
          {({ rows, headers, getHeaderProps, getRowProps, getTableProps, onInputChange }: any) => (
             <TableContainer>
                  <TableToolbar>
                      <TableToolbarContent>
                          <TableToolbarSearch onChange={onInputChange} />
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
                              const contest = contests.find(c => c.id.toString() === row.id);
                              if (!contest) return null;
                              return (
                                  <TableRow 
                                    {...getRowProps({ row })}
                                    onClick={() => handleContestClick(contest)}
                                    style={{ cursor: 'pointer' }}
                                  >
                                      <TableCell>
                                          <div style={{ fontWeight: 500, fontSize: '1rem' }}>
                                              {contest.name}
                                          </div>
                                      </TableCell>
                                      <TableCell>
                                           <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
                                              {new Date(contest.startTime).toLocaleString()}
                                           </div>
                                      </TableCell>
                                      <TableCell>
                                           <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
                                              {new Date(contest.endTime).toLocaleString()}
                                           </div>
                                      </TableCell>
                                      <TableCell>
                                          <Tag type={contest.status === 'active' ? 'green' : 'gray'}>
                                            {contest.status}
                                          </Tag>
                                      </TableCell>
                                      <TableCell>
                                          {contest.isRegistered && <Tag type="green">已報名</Tag>}
                                          {!contest.isRegistered && <Tag type="gray">未報名</Tag>}
                                      </TableCell>
                                      <TableCell>
                                          {/* Action Buttons Logic */}
                                          {!contest.isRegistered ? (
                                              <Button size="sm" onClick={(e) => {
                                                  e.stopPropagation();
                                                  setSelectedContest(contest);
                                                  setRegisterModalOpen(true);
                                              }}>
                                                  報名
                                              </Button>
                                          ) : (
                                              <Button size="sm" kind="tertiary" onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleEnter(contest.id);
                                              }}>
                                                  進入
                                              </Button>
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
  );

  const renderEmptyState = (message: string) => (
    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--cds-text-secondary)' }}>
      <p style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>{message}</p>
    </div>
  );

  if (loading) return <Loading />;

  return (
    <div style={{ width: '100%', minHeight: '100%', backgroundColor: 'var(--cds-background)' }}>
      {/* Centered Max-width Container */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
        <Grid>
          <Column lg={16} md={8} sm={4} style={{ padding: 0 }}>
            
            <PageHeader
                title="競賽列表"
                subtitle="參加競賽，與其他同學切磋程式解題技巧。"
            />

            {/* If Teacher, show Teacher List */}
            {(user?.role === 'teacher' || user?.role === 'admin') && (
                <div style={{ marginBottom: '3rem' }}>
                    <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem' }}>管理競賽</h2>
                    <TeacherContestList contests={contests} />
                </div>
            )}
            
            {/* Student/Public List */}
            <Tabs>
              <TabList aria-label="Contest types">
                <Tab>進行中 ({ongoingContests.length})</Tab>
                <Tab>即將開始 ({upcomingContests.length})</Tab>
                <Tab>已結束 ({pastContests.length})</Tab>
              </TabList>
              <TabPanels>
                <TabPanel>
                    {ongoingContests.length > 0 ? renderContestTable(ongoingContests) : renderEmptyState('目前並沒有可報名的競賽')}
                </TabPanel>
                <TabPanel>
                    {upcomingContests.length > 0 ? renderContestTable(upcomingContests) : renderEmptyState('沒有即將開始的競賽')}
                </TabPanel>
                <TabPanel>
                    {pastContests.length > 0 ? renderContestTable(pastContests) : renderEmptyState('沒有已結束的競賽')}
                </TabPanel>
              </TabPanels>
            </Tabs>

            {/* Registration Modal */}
            <Modal
                open={registerModalOpen}
                onRequestClose={() => setRegisterModalOpen(false)}
                modalHeading={`報名競賽: ${selectedContest?.name}`}
                primaryButtonText="確認報名"
                secondaryButtonText="取消"
                onRequestSubmit={handleRegister}
            >
                <p style={{ marginBottom: '1rem' }}>
                    確定要報名此競賽嗎？
                    {selectedContest?.visibility === 'private' && " 此競賽需要密碼。"}
                </p>
                {selectedContest?.visibility === 'private' && (
                    <input 
                        type="password" 
                        placeholder="輸入競賽密碼"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        style={{ width: '100%', padding: '0.5rem' }}
                    />
                )}
            </Modal>

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
          </Column>
        </Grid>
      </div>
    </div>
  );
};

export default ContestListPage;
