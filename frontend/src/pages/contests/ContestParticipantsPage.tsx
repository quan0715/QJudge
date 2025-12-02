import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Button,
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Tag,
  Modal,
  TextInput,
  Toggle,
  InlineNotification,
  Loading
} from '@carbon/react';
import { Add, Unlocked, Renew } from '@carbon/icons-react';
import { api } from '@/services/api';
import type { ContestParticipant } from '@/models/contest';

const ContestParticipantsPage = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const [participants, setParticipants] = useState<ContestParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Edit Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingParticipant, setEditingParticipant] = useState<ContestParticipant | null>(null);
  const [editLockReason, setEditLockReason] = useState('');
  const [editIsLocked, setEditIsLocked] = useState(false);
  const [editHasFinished, setEditHasFinished] = useState(false);

  // Add Modal State
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addUsername, setAddUsername] = useState('');

  useEffect(() => {
    if (contestId) {
      loadParticipants();
    }
  }, [contestId]);

  const loadParticipants = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getContestParticipants(contestId!);
      setParticipants(data);
    } catch (err: any) {
      console.error('Failed to load participants', err);
      setError(err.message || '無法載入參賽者列表');
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async (userId: number) => {
    if (!confirm('確定要解除此學生的鎖定嗎？')) return;
    try {
      await api.unlockParticipant(contestId!, userId);
      alert('已解除鎖定');
      loadParticipants();
    } catch (err: any) {
      alert(err.message || '解除鎖定失敗');
    }
  };

  const handleEditClick = (p: ContestParticipant) => {
    setEditingParticipant(p);
    setEditLockReason(p.lock_reason || '');
    setEditIsLocked(p.is_locked);
    setEditHasFinished(p.has_finished_exam);
    setEditModalOpen(true);
  };

  const handleSaveParticipant = async () => {
    if (!editingParticipant) return;
    try {
      await api.updateParticipant(contestId!, editingParticipant.user_id, {
        is_locked: editIsLocked,
        lock_reason: editLockReason,
        has_finished_exam: editHasFinished
      });
      alert('更新成功');
      setEditModalOpen(false);
      loadParticipants();
    } catch (err: any) {
      alert(err.message || '更新失敗');
    }
  };

  const handleAddParticipant = async () => {
    if (!addUsername) return;
    try {
      await api.addParticipant(contestId!, addUsername);
      alert('新增成功');
      setAddModalOpen(false);
      setAddUsername('');
      loadParticipants();
    } catch (err: any) {
      alert(err.message || '新增失敗');
    }
  };

  if (loading && participants.length === 0) return <Loading />;

  return (
    <div className="cds--grid" style={{ padding: '0' }}>
      <div className="cds--row">
        <div className="cds--col-lg-16">
          {error && (
            <InlineNotification
              kind="error"
              title="錯誤"
              subtitle={error}
              onClose={() => setError('')}
              style={{ marginBottom: '1rem' }}
            />
          )}

          <DataTable
            rows={participants.map((p) => ({ ...p, id: p.user_id.toString() }))}
            headers={[
              { key: 'username', header: '使用者' },
              { key: 'joined_at', header: '加入時間' },
              { key: 'status', header: '狀態' },
              { key: 'lock_reason', header: '鎖定原因' },
              { key: 'actions', header: '操作' },
            ]}
            render={({ rows, headers, getHeaderProps, getRowProps }) => (
              <TableContainer
                title="參賽者管理"
                description="管理參賽者狀態、鎖定與解鎖"
              >
                <div style={{ padding: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                   <Button size="sm" kind="tertiary" renderIcon={Renew} onClick={loadParticipants}>
                    重新整理
                  </Button>
                  <Button size="sm" renderIcon={Add} onClick={() => setAddModalOpen(true)}>
                    新增參賽者
                  </Button>
                </div>
                <Table>
                  <TableHead>
                    <TableRow>
                      {headers.map((header) => {
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
                    {rows.map((row) => {
                      const p = participants.find(item => item.user_id.toString() === row.id);
                      if (!p) return null;

                      const { key, ...rowProps } = getRowProps({ row });
                      return (
                        <TableRow {...rowProps} key={key}>
                          <TableCell>
                            <div style={{ fontWeight: 'bold' }}>{p.username}</div>
                            <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
                              {p.user?.email}
                            </div>
                          </TableCell>
                          <TableCell>{new Date(p.joined_at).toLocaleString()}</TableCell>
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
                              <span style={{ color: 'var(--cds-support-error)' }}>
                                {p.lock_reason}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <Button
                                size="sm"
                                kind="ghost"
                                onClick={() => handleEditClick(p)}
                              >
                                編輯
                              </Button>
                              {p.is_locked && (
                                <Button
                                  size="sm"
                                  kind="ghost"
                                  renderIcon={Unlocked}
                                  onClick={() => handleUnlock(p.user_id)}
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
          />

          {/* Edit Participant Modal */}
          <Modal
            open={editModalOpen}
            modalHeading="編輯參賽者狀態"
            primaryButtonText="儲存"
            secondaryButtonText="取消"
            onRequestClose={() => setEditModalOpen(false)}
            onRequestSubmit={handleSaveParticipant}
          >
            {editingParticipant && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div>
                  <strong>使用者:</strong> {editingParticipant.username}
                </div>
                
                <Toggle
                  id="edit-is-locked"
                  labelText="鎖定狀態"
                  toggled={editIsLocked}
                  onToggle={(checked) => setEditIsLocked(checked)}
                />
                
                {editIsLocked && (
                  <TextInput
                    id="edit-lock-reason"
                    labelText="鎖定原因"
                    value={editLockReason}
                    onChange={(e) => setEditLockReason(e.target.value)}
                  />
                )}
                
                <Toggle
                  id="edit-has-finished"
                  labelText="已完成考試 (已交卷)"
                  toggled={editHasFinished}
                  onToggle={(checked) => setEditHasFinished(checked)}
                />
                <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
                  若取消勾選，學生可重新進入考試介面繼續作答
                </p>
              </div>
            )}
          </Modal>

          {/* Add Participant Modal */}
          <Modal
            open={addModalOpen}
            modalHeading="新增參賽者"
            primaryButtonText="新增"
            secondaryButtonText="取消"
            onRequestClose={() => setAddModalOpen(false)}
            onRequestSubmit={handleAddParticipant}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <TextInput
                id="add-username"
                labelText="使用者名稱 (Username)"
                placeholder="請輸入使用者名稱"
                value={addUsername}
                onChange={(e) => setAddUsername(e.target.value)}
              />
              <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
                輸入使用者名稱以將其加入此競賽
              </p>
            </div>
          </Modal>
        </div>
      </div>
    </div>
  );
};

export default ContestParticipantsPage;
