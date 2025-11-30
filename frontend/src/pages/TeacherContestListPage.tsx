import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  Button,
  Tag,
  Loading,
  Modal
} from '@carbon/react';
import { Add, Edit, TrashCan, Archive } from '@carbon/icons-react';
import { api } from '../services/api';
import type { Contest } from '../services/api';

const TeacherContestListPage = () => {
  const navigate = useNavigate();
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [contestToDelete, setContestToDelete] = useState<string | null>(null);
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [contestToArchive, setContestToArchive] = useState<string | null>(null);

  useEffect(() => {
    loadContests();
  }, []);

  const loadContests = async () => {
    setLoading(true);
    try {
      const data = await api.getContests('manage');
      setContests(data);
    } catch (error) {
      console.error('Failed to load contests', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (id: string) => {
    setContestToDelete(id);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (contestToDelete) {
      try {
        await api.deleteContest(contestToDelete);
        setDeleteModalOpen(false);
        setContestToDelete(null);
        loadContests();
      } catch (error) {
        alert('刪除失敗');
      }
    }
  };

  const handleArchiveClick = (id: string) => {
    setContestToArchive(id);
    setArchiveModalOpen(true);
  };

  const confirmArchive = async () => {
    if (contestToArchive) {
      try {
        await api.archiveContest(contestToArchive);
        setArchiveModalOpen(false);
        setContestToArchive(null);
        loadContests();
      } catch (error) {
        alert('封存失敗');
      }
    }
  };

  const headers = [
    { key: 'title', header: '標題' },
    { key: 'status', header: '狀態' },
    { key: 'time', header: '時間' },
    { key: 'visibility', header: '可見性' },
    { key: 'actions', header: '操作' }
  ];

  const rows = contests.map(c => ({
    id: c.id,
    title: c.title,
    status: (
      <Tag type={c.status === 'ongoing' ? 'green' : c.status === 'upcoming' ? 'blue' : 'gray'}>
        {c.status === 'ongoing' ? '進行中' : c.status === 'upcoming' ? '未開始' : '已結束'}
      </Tag>
    ),
    time: `${new Date(c.start_time).toLocaleString()} ~ ${new Date(c.end_time).toLocaleString()}`,
    visibility: !c.is_public ? <Tag type="purple">私有 (密碼)</Tag> : <Tag type="teal">公開</Tag>,
    actions: (
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <Button
          kind="ghost"
          size="sm"
          renderIcon={Edit}
          iconDescription="編輯"
          hasIconOnly
          onClick={() => navigate(`/contests/${c.id}`)}
        />
        <Button
          kind="ghost"
          size="sm"
          renderIcon={Archive}
          iconDescription="封存"
          hasIconOnly
          onClick={() => handleArchiveClick(c.id)}
          disabled={c.is_archived}
        />
        <Button
          kind="danger--ghost"
          size="sm"
          renderIcon={TrashCan}
          iconDescription="刪除"
          hasIconOnly
          onClick={() => handleDeleteClick(c.id)}
        />
      </div>
    )
  }));

  if (loading) return <Loading />;

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 300 }}>競賽管理</h1>
        <Button renderIcon={Add} onClick={() => navigate('/teacher/contests/new')}>
          建立競賽
        </Button>
      </div>

      <DataTable rows={rows} headers={headers}>
        {({ rows, headers, getHeaderProps, getTableProps }) => (
          <TableContainer title="我的競賽">
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
                  <TableRow key={row.id}>
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

      <Modal
        open={deleteModalOpen}
        modalHeading="刪除競賽"
        primaryButtonText="刪除"
        secondaryButtonText="取消"
        danger
        onRequestClose={() => setDeleteModalOpen(false)}
        onRequestSubmit={confirmDelete}
      >
        <p>確定要刪除此競賽嗎？此動作無法復原。</p>
      </Modal>

      <Modal
        open={archiveModalOpen}
        modalHeading="封存競賽"
        primaryButtonText="封存"
        secondaryButtonText="取消"
        onRequestClose={() => setArchiveModalOpen(false)}
        onRequestSubmit={confirmArchive}
      >
        <p>確定要封存此競賽嗎？封存後將移至封存列表。</p>
      </Modal>
    </div>
  );
};

export default TeacherContestListPage;
