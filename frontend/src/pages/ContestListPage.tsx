import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Tag,
  Modal,
  TextInput,
  Loading,
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
import { api } from '../services/api';
import type { Contest } from '../services/api';

const ContestListPage = () => {
  const navigate = useNavigate();
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal State
  const [selectedContest, setSelectedContest] = useState<Contest | null>(null);
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [enterModalOpen, setEnterModalOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchContests = async () => {
      try {
        const data = await api.getContests();
        setContests(data);
      } catch (error) {
        console.error('Failed to fetch contests', error);
      } finally {
        setLoading(false);
      }
    };
    fetchContests();
  }, []);

  const handleContestClick = (contest: Contest) => {
    // Check if user is privileged (admin or teacher)
    const userStr = localStorage.getItem('user');
    let isPrivileged = false;
    try {
        const user = JSON.parse(userStr || '{}');
        isPrivileged = user.role === 'admin' || user.role === 'teacher';
    } catch (e) {
        console.error('Failed to parse user', e);
    }

    // Check if user has already left the contest
    if (contest.has_left && !contest.allow_multiple_joins && !isPrivileged) {
      alert('您已離開此競賽，無法再次進入。');
      return;
    }

    // Check if contest has not started
    if (contest.status === 'upcoming') {
      alert('競賽尚未開始，請稍後再試。');
      return;
    }

    if (contest.is_registered) {
      // If registered, open Entry Confirmation Modal instead of direct navigation
      setSelectedContest(contest);
      setEnterModalOpen(true);
    } else {
      // If not registered, open Registration Modal
      setSelectedContest(contest);
      setRegisterModalOpen(true);
      setPassword('');
      setError('');
    }
  };

  const handleRegister = async () => {
    if (!selectedContest) return;

    try {
      await api.registerContest(selectedContest.id, password);
      setRegisterModalOpen(false);
      // After registration, refresh list
      const data = await api.getContests();
      setContests(data);
    } catch (err: any) {
      setError(err.message || '密碼錯誤或報名失敗');
    }
  };

  const handleEnterConfirm = async () => {
    if (!selectedContest) return;
    
    try {
      await api.enterContest(selectedContest.id);
      setEnterModalOpen(false);
      navigate(`/contests/${selectedContest.id}`);
    } catch (err: any) {
      alert(err.message || '無法進入競賽');
    }
  };

  const headers = [
    { key: 'title', header: '競賽名稱' },
    { key: 'status', header: '狀態' },
    { key: 'time', header: '時間' },
    { key: 'userStatus', header: '您的狀態' },
    { key: 'type', header: '類型' },
  ];

  const renderTable = (filteredContests: Contest[]) => {
    const rows = filteredContests.map(c => {
      return {
        id: c.id,
        title: (
          <div style={{ fontWeight: 500, fontSize: '1rem' }}>
            {c.title}
          </div>
        ),
        status: (
          <Tag type={c.status === 'running' ? 'green' : c.status === 'upcoming' ? 'blue' : 'gray'}>
            {c.status === 'running' ? '進行中' : c.status === 'upcoming' ? '即將開始' : '已結束'}
          </Tag>
        ),
        time: (
          <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
            {new Date(c.start_time).toLocaleString()} ~ {new Date(c.end_time).toLocaleString()}
          </div>
        ),
        userStatus: (
          <div>
            {c.has_left ? (
              <Tag type="red">已離開</Tag>
            ) : c.is_registered ? (
              <Tag type="teal">已報名</Tag>
            ) : (
              <Tag type="gray">未報名</Tag>
            )}
          </div>
        ),
        type: c.is_private ? <Tag type="purple">需密碼</Tag> : <Tag type="cool-gray">公開</Tag>
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

  const activeContests = contests.filter(c => !c.is_archived);
  const archivedContests = contests.filter(c => c.is_archived);

  if (loading) return <Loading />;

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 300, marginBottom: '0.5rem' }}>競賽列表</h1>
        <p style={{ color: 'var(--cds-text-secondary)' }}>
          參加競賽，與其他同學切磋程式解題技巧。
        </p>
      </div>

      <Tabs>
        <TabList aria-label="Contest types">
          <Tab>進行中 / 即將開始</Tab>
          <Tab>已封存</Tab>
        </TabList>
        <TabPanels>
          <TabPanel>
            {renderTable(activeContests)}
          </TabPanel>
          <TabPanel>
            {renderTable(archivedContests)}
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* Registration Modal */}
      <Modal
        open={registerModalOpen}
        modalHeading={`報名競賽: ${selectedContest?.title}`}
        primaryButtonText="確認報名"
        secondaryButtonText="取消"
        onRequestClose={() => setRegisterModalOpen(false)}
        onRequestSubmit={handleRegister}
      >
        <p style={{ marginBottom: '1rem' }}>
          {selectedContest?.description || '確定要報名此競賽嗎？'}
        </p>
        {selectedContest?.is_private && (
          <TextInput
            id="contest-password"
            labelText="競賽密碼"
            type="password"
            placeholder="請輸入密碼"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            invalid={!!error}
            invalidText={error}
          />
        )}
        {!selectedContest?.is_private && error && (
          <p style={{ color: 'red' }}>{error}</p>
        )}
      </Modal>

      {/* Entry Confirmation Modal */}
      <Modal
        open={enterModalOpen}
        modalHeading="進入競賽確認"
        primaryButtonText="進入競賽"
        secondaryButtonText="取消"
        onRequestClose={() => setEnterModalOpen(false)}
        onRequestSubmit={handleEnterConfirm}
        danger // Use danger style to emphasize the warning
      >
        <div style={{ fontSize: '1rem', lineHeight: '1.5' }}>
          <p style={{ marginBottom: '1rem', fontWeight: 'bold' }}>
            您即將進入競賽：{selectedContest?.title}
          </p>
          <p style={{ marginBottom: '0.5rem' }}>請注意以下規則：</p>
          <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '1rem' }}>
            <li>競賽期間請勿與他人討論試題。</li>
            <li>
              {selectedContest?.allow_multiple_joins ? (
                <span>本競賽允許中途離開後再次進入。</span>
              ) : (
                <span>
                  <span style={{ color: 'red', fontWeight: 'bold' }}>重要：</span>
                  本競賽採「一次性進入」機制。若您中途點擊「離開競賽」按鈕，將無法再次進入考場。
                </span>
              )}
            </li>
            <li>請確保您的網路連線穩定。</li>
          </ul>
          <p>準備好開始了嗎？</p>
        </div>
      </Modal>
    </div>
  );
};

export default ContestListPage;
