import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { 
  Button, 
  InlineNotification, 
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
  Tag,
  Toggle,
  TextArea
} from '@carbon/react';
import { Add, Renew, Edit, Unlocked } from '@carbon/icons-react';
import { api } from '@/services/api';
import type { ContestDetail, ContestParticipant } from '@/models/contest';
import ContainerCard from '@/components/contest/layout/ContainerCard';

interface ContestAdminContext {
  contest: ContestDetail;
  refreshContest: () => void;
}

const ContestParticipantsPage: React.FC = () => {
  const { contest } = useOutletContext<ContestAdminContext>();
  
  const [participants, setParticipants] = useState<ContestParticipant[]>([]);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{ kind: 'success' | 'error', message: string } | null>(null);

  const [addParticipantModalOpen, setAddParticipantModalOpen] = useState(false);
  const [addParticipantUsername, setAddParticipantUsername] = useState('');
  
  const [editParticipantModalOpen, setEditParticipantModalOpen] = useState(false);
  const [editingParticipant, setEditingParticipant] = useState<ContestParticipant | null>(null);
  const [editLockReason, setEditLockReason] = useState('');
  const [editIsLocked, setEditIsLocked] = useState(false);
  const [editHasFinished, setEditHasFinished] = useState(false);

  useEffect(() => {
    if (contest.id) {
      loadParticipants();
    }
  }, [contest.id]);

  const loadParticipants = async () => {
    if (!contest.id) return;
    setLoading(true);
    try {
      const data = await api.getContestParticipants(contest.id.toString());
      setParticipants(data);
    } catch (error) {
      console.error('Failed to load participants', error);
      setNotification({ kind: 'error', message: '無法載入參賽者列表' });
    } finally {
      setLoading(false);
    }
  };

  const handleAddParticipant = async () => {
    if (!contest.id || !addParticipantUsername) return;
    try {
      await api.addParticipant(contest.id.toString(), addParticipantUsername);
      setAddParticipantModalOpen(false);
      setAddParticipantUsername('');
      loadParticipants();
      setNotification({ kind: 'success', message: '參賽者已新增' });
    } catch (error: any) {
      setNotification({ kind: 'error', message: error.message || '新增參賽者失敗' });
    }
  };

  const handleUnlockParticipant = async (userId: number) => {
    if (!contest.id || !confirm('確定要解除此學生的鎖定嗎？')) return;
    try {
      await api.unlockParticipant(contest.id.toString(), userId);
      loadParticipants();
      setNotification({ kind: 'success', message: '已解除鎖定' });
    } catch (error: any) {
      setNotification({ kind: 'error', message: error.message || '解除鎖定失敗' });
    }
  };

  const openEditParticipantModal = (p: ContestParticipant) => {
    setEditingParticipant(p);
    setEditIsLocked(p.is_locked);
    setEditLockReason(p.lock_reason || '');
    setEditHasFinished(p.has_finished_exam);
    setEditParticipantModalOpen(true);
  };

  const handleUpdateParticipant = async () => {
    if (!contest.id || !editingParticipant) return;
    try {
      await api.updateParticipant(contest.id.toString(), editingParticipant.user_id, {
        is_locked: editIsLocked,
        lock_reason: editLockReason,
        has_finished_exam: editHasFinished
      });
      setEditParticipantModalOpen(false);
      loadParticipants();
      setNotification({ kind: 'success', message: '參賽者狀態已更新' });
    } catch (error: any) {
      setNotification({ kind: 'error', message: error.message || '更新失敗' });
    }
  };

  return (
    <div>
      {notification && (
        <InlineNotification
          kind={notification.kind}
          title={notification.kind === 'success' ? '成功' : '錯誤'}
          subtitle={notification.message}
          onClose={() => setNotification(null)}
          style={{ marginBottom: '1rem', maxWidth: '100%' }}
        />
      )}

      <ContainerCard
        title="參賽者列表"
        action={
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button size="sm" kind="ghost" renderIcon={Renew} onClick={loadParticipants}>
              重新整理
            </Button>
            <Button size="sm" renderIcon={Add} onClick={() => setAddParticipantModalOpen(true)}>
              新增參賽者
            </Button>
          </div>
        }
        noPadding
      >
        {loading ? (
          <Loading withOverlay={false} />
        ) : (
          <DataTable
            rows={participants.map(p => ({ ...p, id: p.user_id.toString() }))}
            headers={[
              { key: 'username', header: '使用者' },
              { key: 'joined_at', header: '加入時間' },
              { key: 'status', header: '狀態' },
              { key: 'lock_reason', header: '鎖定原因' },
              { key: 'actions', header: '操作' }
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
                      const p = participants.find(item => item.user_id.toString() === row.id);
                      if (!p) return null;
                      return (
                        <TableRow {...getRowProps({ row })} key={row.id}>
                          <TableCell>
                            <div style={{ fontWeight: 600 }}>{p.username}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
                              {p.user?.email}
                            </div>
                          </TableCell>
                          <TableCell>{new Date(p.joined_at).toLocaleString('zh-TW')}</TableCell>
                          <TableCell>
                            {p.is_locked ? (
                              <Tag type="red">已鎖定</Tag>
                            ) : p.has_finished_exam ? (
                              <Tag type="green">已交卷</Tag>
                            ) : (
                              <Tag type="blue">進行中</Tag>
                            )}
                          </TableCell>
                          <TableCell>
                            {p.is_locked && (
                              <span style={{ color: 'var(--cds-text-error)', fontSize: '0.875rem' }}>
                                {p.lock_reason}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <Button 
                                kind="ghost" 
                                size="sm" 
                                renderIcon={Edit}
                                onClick={() => openEditParticipantModal(p)}
                              >
                                編輯
                              </Button>
                              {p.is_locked && (
                                <Button 
                                  kind="ghost" 
                                  size="sm" 
                                  renderIcon={Unlocked}
                                  onClick={() => handleUnlockParticipant(p.user_id)}
                                >
                                  解鎖
                                </Button>
                              )}
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
        )}
      </ContainerCard>

      {/* Add Participant Modal */}
      <Modal
        open={addParticipantModalOpen}
        modalHeading="新增參賽者"
        primaryButtonText="新增"
        secondaryButtonText="取消"
        onRequestSubmit={handleAddParticipant}
        onRequestClose={() => setAddParticipantModalOpen(false)}
      >
        <TextInput
          id="username"
          labelText="使用者名稱"
          placeholder="輸入使用者名稱"
          value={addParticipantUsername}
          onChange={(e) => setAddParticipantUsername(e.target.value)}
        />
      </Modal>

      {/* Edit Participant Modal */}
      <Modal
        open={editParticipantModalOpen}
        modalHeading={`編輯參賽者: ${editingParticipant?.username}`}
        primaryButtonText="儲存"
        secondaryButtonText="取消"
        onRequestSubmit={handleUpdateParticipant}
        onRequestClose={() => setEditParticipantModalOpen(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Toggle
            id="edit-is-locked"
            labelText="鎖定狀態"
            labelA="未鎖定"
            labelB="已鎖定"
            toggled={editIsLocked}
            onToggle={(checked) => setEditIsLocked(checked)}
          />
          {editIsLocked && (
            <TextArea
              id="edit-lock-reason"
              labelText="鎖定原因"
              value={editLockReason}
              onChange={(e) => setEditLockReason(e.target.value)}
            />
          )}
          <Toggle
            id="edit-has-finished"
            labelText="交卷狀態"
            labelA="未交卷"
            labelB="已交卷"
            toggled={editHasFinished}
            onToggle={(checked) => setEditHasFinished(checked)}
          />
        </div>
      </Modal>
    </div>
  );
};

export default ContestParticipantsPage;
