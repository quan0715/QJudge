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
  Button,
  Loading,
  InlineNotification,
  Modal,
  Tag,
  TextInput,
  Pagination,
  TextArea,
  Dropdown
} from '@carbon/react';
import { Add, Edit, TrashCan, Unlocked, Renew, Restart } from '@carbon/icons-react';
import { 
  getContestParticipants, 
  addContestParticipant,
  unlockParticipant, 
  updateParticipant, 
  removeParticipant,
  reopenExam
} from '@/services/contest';
import type { ContestParticipant, ExamStatusType } from '@/core/entities/contest.entity';
import ContainerCard from '@/ui/components/layout/ContainerCard';
import { PageHeader } from '@/ui/layout/PageHeader';

const ContestAdminParticipantsPage = () => {
  const { contestId } = useParams<{ contestId: string }>();

  const [loading, setLoading] = useState(true);
  const [participants, setParticipants] = useState<ContestParticipant[]>([]);
  const [notification, setNotification] = useState<{ kind: 'success' | 'error', message: string } | null>(null);

  // Add Participant State
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addUsername, setAddUsername] = useState('');
  const [adding, setAdding] = useState(false);

  // Edit Participant State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingParticipant, setEditingParticipant] = useState<ContestParticipant | null>(null);
  const [editExamStatus, setEditExamStatus] = useState<ExamStatusType>('not_started');
  const [editLockReason, setEditLockReason] = useState('');
  const [saving, setSaving] = useState(false);

  // Exam status options for dropdown
  const examStatusOptions = [
    { id: 'not_started', label: '未開始' },
    { id: 'in_progress', label: '進行中' },
    { id: 'paused', label: '已暫停' },
    { id: 'locked', label: '已鎖定' },
    { id: 'submitted', label: '已交卷' },
  ];

  // Status filter options (includes "all")
  const statusFilterOptions = [
    { id: 'all', label: '全部狀態' },
    ...examStatusOptions,
  ];

  // Status filter state
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    if (contestId) {
      loadParticipants();
    }
  }, [contestId]);

  const loadParticipants = async () => {
    try {
      setLoading(true);
      const data = await getContestParticipants(contestId!);
      setParticipants(data);
    } catch (error) {
      console.error('Failed to load participants', error);
      setNotification({ kind: 'error', message: '無法載入參賽者列表' });
    } finally {
      setLoading(false);
    }
  };

  const handleAddParticipant = async () => {
    if (!contestId || !addUsername) return;
    try {
      setAdding(true);
      await addContestParticipant(contestId, addUsername);
      setAddModalOpen(false);
      setAddUsername('');
      await loadParticipants();
      setNotification({ kind: 'success', message: '參賽者已新增' });
    } catch (error: any) {
      setNotification({ kind: 'error', message: error.message || '新增參賽者失敗' });
    } finally {
      setAdding(false);
    }
  };

  const handleUnlock = async (userId: number) => {
    if (!contestId || !confirm('確定要解除此學生的鎖定嗎？')) return;
    try {
      await unlockParticipant(contestId, userId);
      await loadParticipants();
      setNotification({ kind: 'success', message: '已解除鎖定' });
    } catch (error: any) {
      setNotification({ kind: 'error', message: error.message || '解除鎖定失敗' });
    }
  };

  const openEditModal = (p: ContestParticipant) => {
    setEditingParticipant(p);
    setEditExamStatus(p.examStatus || 'not_started');
    setEditLockReason(p.lockReason || '');
    setEditModalOpen(true);
  };

  const handleUpdateParticipant = async () => {
    if (!contestId || !editingParticipant) return;
    try {
      setSaving(true);
      await updateParticipant(contestId, Number(editingParticipant.userId), {
        exam_status: editExamStatus,
        lock_reason: editExamStatus === 'locked' ? editLockReason : ''
      });
      setEditModalOpen(false);
      await loadParticipants();
      setNotification({ kind: 'success', message: '參賽者狀態已更新' });
    } catch (error: any) {
      setNotification({ kind: 'error', message: error.message || '更新失敗' });
    } finally {
      setSaving(false);
    }
  };

  const handleReopenExam = async (userId: number) => {
    if (!contestId || !confirm('確定要重新開放此學生考試嗎？')) return;
    try {
      await reopenExam(contestId, userId);
      await loadParticipants();
      setNotification({ kind: 'success', message: '已重新開放考試' });
    } catch (error: any) {
      setNotification({ kind: 'error', message: error.message || '重新開放失敗' });
    }
  };

  const handleRemoveParticipant = async (userId: number, username: string) => {
    if (!contestId || !confirm(`確定要移除參賽者 ${username} 嗎？`)) return;
    try {
      await removeParticipant(contestId, userId);
      await loadParticipants();
      setNotification({ kind: 'success', message: '參賽者已移除' });
    } catch (error: any) {
      setNotification({ kind: 'error', message: error.message || '移除參賽者失敗' });
    }
  };

  // Prepare table rows
  const headers = [
    { key: 'username', header: '使用者' },
    { key: 'joinedAt', header: '加入時間' },
    { key: 'status', header: '狀態' },
    { key: 'lockReason', header: '鎖定原因' },
    { key: 'actions', header: '操作' }
  ];

  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  // Apply status filter
  const filteredParticipants = statusFilter === 'all' 
    ? participants 
    : participants.filter(p => (p.examStatus || 'not_started') === statusFilter);

  const paginatedParticipants = filteredParticipants.slice(startIndex, endIndex);

  if (loading && participants.length === 0) return <Loading />;

  return (
    <div className="contest-admin-participants">
      <PageHeader 
        title="參賽者管理" 
        subtitle={`共 ${participants.length} 位參賽者`}
        maxWidth="1056px"
        action={
            <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Button size="md" kind="secondary" renderIcon={Renew} onClick={loadParticipants}>
                    重新整理
                </Button>
                <Button size="md" renderIcon={Add} onClick={() => setAddModalOpen(true)}>
                    新增參賽者
                </Button>
            </div>
        }
      />

      <div style={{ padding: '1rem', maxWidth: '1056px', margin: '0 auto', width: '100%' }}>
        {notification && (
          <InlineNotification
            kind={notification.kind}
            title={notification.kind === 'success' ? '成功' : '錯誤'}
            subtitle={notification.message}
            onClose={() => setNotification(null)}
            style={{ marginBottom: '1rem', maxWidth: '100%' }}
          />
        )}

        <ContainerCard noPadding>
            {/* Status Filter */}
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--cds-border-subtle)', display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <Dropdown
                id="status-filter"
                titleText="篩選狀態"
                label="選擇狀態"
                items={statusFilterOptions}
                itemToString={(item: any) => item?.label || ''}
                selectedItem={statusFilterOptions.find(opt => opt.id === statusFilter)}
                onChange={({ selectedItem }: any) => {
                  setStatusFilter(selectedItem?.id || 'all');
                  setPage(1); // Reset to first page when filter changes
                }}
                size="sm"
                style={{ minWidth: '150px' }}
              />
              <span style={{ color: 'var(--cds-text-secondary)', fontSize: '0.875rem' }}>
                顯示 {filteredParticipants.length} / {participants.length} 位參賽者
              </span>
            </div>
            <DataTable
                rows={paginatedParticipants.map(p => ({ ...p, id: p.userId.toString() }))}
                headers={headers}
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
                          const p = participants.find(item => item.userId.toString() === row.id);
                          if (!p) return null;
                          return (
                            <TableRow {...getRowProps({ row })} key={row.id}>
                                <TableCell>
                                    <div style={{ fontWeight: 600 }}>{p.username}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>ID: {p.userId}</div>
                                </TableCell>
                                <TableCell>{new Date(p.joinedAt).toLocaleString()}</TableCell>
                                <TableCell>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        {p.examStatus === 'locked' && <Tag type="red" size="sm">已鎖定</Tag>}
                                        {p.examStatus === 'submitted' && <Tag type="green" size="sm">已交卷</Tag>}
                                        {p.examStatus === 'in_progress' && <Tag type="blue" size="sm">進行中</Tag>}
                                        {p.examStatus === 'paused' && <Tag type="warm-gray" size="sm">已暫停</Tag>}
                                        {(p.examStatus === 'not_started' || !p.examStatus) && <Tag type="cool-gray" size="sm">未開始</Tag>}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    {p.lockReason || '-'}
                                </TableCell>
                                <TableCell>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        {p.examStatus === 'locked' && (
                                            <Button 
                                                kind="ghost" 
                                                size="sm" 
                                                renderIcon={Unlocked} 
                                                iconDescription="解除鎖定" 
                                                hasIconOnly 
                                                onClick={() => handleUnlock(Number(p.userId))}
                                            />
                                        )}
                                        {p.examStatus === 'submitted' && (
                                            <Button 
                                                kind="ghost" 
                                                size="sm" 
                                                renderIcon={Restart} 
                                                iconDescription="重新開放考試" 
                                                hasIconOnly 
                                                onClick={() => handleReopenExam(Number(p.userId))}
                                            />
                                        )}
                                        <Button
                                            kind="ghost"
                                            size="sm"
                                            renderIcon={Edit}
                                            iconDescription="編輯狀態"
                                            hasIconOnly
                                            onClick={() => openEditModal(p)}
                                        />
                                        <Button
                                            kind="danger--ghost"
                                            size="sm"
                                            renderIcon={TrashCan}
                                            iconDescription="移除參賽者"
                                            hasIconOnly
                                            onClick={() => handleRemoveParticipant(Number(p.userId), p.username)}
                                        />
                                    </div>
                                </TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                    </Table>
                </TableContainer>
                )}
            </DataTable>
            <Pagination
                totalItems={filteredParticipants.length}
                backwardText="上一頁"
                forwardText="下一頁"
                itemsPerPageText="每頁顯示"
                page={page}
                pageSize={pageSize}
                pageSizes={[10, 20, 50, 100]}
                onChange={({ page: newPage, pageSize: newPageSize }: any) => {
                    setPage(newPage);
                    setPageSize(newPageSize);
                }}
            />
        </ContainerCard>

        {/* Add Participant Modal */}
        <Modal
            open={addModalOpen}
            modalHeading="新增參賽者"
            primaryButtonText={adding ? "新增中..." : "新增"}
            secondaryButtonText="取消"
            onRequestSubmit={handleAddParticipant}
            onRequestClose={() => setAddModalOpen(false)}
            primaryButtonDisabled={adding || !addUsername}
        >
            <TextInput
                id="username"
                labelText="使用者名稱 (Username)"
                placeholder="輸入要加入的使用者名稱"
                value={addUsername}
                onChange={(e) => setAddUsername(e.target.value)}
            />
        </Modal>

        {/* Edit Participant Modal */}
        <Modal
            open={editModalOpen}
            modalHeading={`編輯參賽者: ${editingParticipant?.username}`}
            primaryButtonText={saving ? "儲存中..." : "儲存變更"}
            secondaryButtonText="取消"
            onRequestSubmit={handleUpdateParticipant}
            onRequestClose={() => setEditModalOpen(false)}
            primaryButtonDisabled={saving}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <Dropdown
                    id="exam-status"
                    titleText="考試狀態"
                    label="選擇狀態"
                    items={examStatusOptions}
                    itemToString={(item: any) => item?.label || ''}
                    selectedItem={examStatusOptions.find(opt => opt.id === editExamStatus)}
                    onChange={({ selectedItem }: any) => setEditExamStatus(selectedItem?.id as ExamStatusType)}
                />
                
                {editExamStatus === 'locked' && (
                    <TextArea
                        id="lock-reason"
                        labelText="鎖定原因"
                        value={editLockReason}
                        onChange={(e) => setEditLockReason(e.target.value)}
                    />
                )}
            </div>
        </Modal>
      </div>
    </div>
  );
};

export default ContestAdminParticipantsPage;
