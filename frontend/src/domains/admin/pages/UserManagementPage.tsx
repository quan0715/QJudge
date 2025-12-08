import { useState, useEffect } from 'react';
import { 
  Search, 
  UserAdmin, 
  CheckmarkFilled,
  TrashCan,
  WarningAlt
} from '@carbon/icons-react';
import {
  TextInput,
  Button, 
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Select,
  SelectItem,
  Modal,
  TableContainer,
  Tag,
  InlineNotification,
  Grid,
  Column,
  } from '@carbon/react';
import { searchUsers, updateUserRole, deleteUser } from '@/services/auth';
import type { User } from '@/core/entities/auth.entity';

const UserManagementPage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newRole, setNewRole] = useState('');
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  // Load all users on mount
  useEffect(() => {
    loadAllUsers();
  }, []);

  const loadAllUsers = async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await searchUsers('');  // Empty query = all users
      if (response.success) {
        setUsers(response.data);
      } else {
        setError('Failed to load users');
      }
    } catch (err: any) {
      if (err.response?.data?.error?.message) {
        setError(err.response.data.error.message);
      } else {
        setError('Failed to load users');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      // If search is empty, reload all users
      loadAllUsers();
      return;
    }

    if (searchQuery.length < 2) {
      setError('請輸入至少 2 個字元進行搜尋');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      const response = await searchUsers(searchQuery);
      if (response.success) {
        setUsers(response.data);
        if (response.data.length === 0) {
          setError('未找到符合的使用者');
        }
      } else {
        setError('搜尋失敗');
      }
    } catch (err: any) {
      if (err.response?.data?.error?.message) {
        setError(err.response.data.error.message);
      } else {
        setError('搜尋失敗，請稍後再試');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChangeClick = (user: User, role: string) => {
    setSelectedUser(user);
    setNewRole(role);
    setConfirmModalOpen(true);
  };

  const handleConfirmRoleChange = async () => {
    if (!selectedUser) return;

    setUpdating(true);
    try {
      const response = await updateUserRole(selectedUser.id, newRole);
      if (response.success) {
        setSuccess(response.message || '角色更新成功');
        // Update user in list
        setUsers(users.map(u => 
          u.id === selectedUser.id ? { ...u, role: newRole as any } : u
        ));
        setConfirmModalOpen(false);
      } else {
        setError('更新失敗');
      }
    } catch (err: any) {
      if (err.response?.data?.error?.message) {
        setError(err.response.data.error.message);
      } else {
        setError('更新失敗，請稍後再試');
      }
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteClick = (user: User) => {
    setUserToDelete(user);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!userToDelete) return;

      try {
        await deleteUser(userToDelete.id);
        setSuccess(`已刪除用戶 ${userToDelete.email}`);
        // Refresh user list
        loadAllUsers();
    } catch {
      setError('刪除用戶時發生錯誤');
    } finally {
      setIsDeleteModalOpen(false);
      setUserToDelete(null);
    }
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      'student': '學生',
      'teacher': '教師',
      'admin': '管理員 (TA)'
    };
    return labels[role] || role;
  };

  const getProviderLabel = (provider?: string) => {
    if (!provider) return 'Unknown';
    const labels: Record<string, string> = {
      'email': 'Email/密碼',
      'nycu-oauth': 'SSO',
      'google': 'Google',
      'github': 'GitHub'
    };
    return labels[provider] || provider;
  };

  return (
    <div style={{ width: '100%', minHeight: '100%', backgroundColor: 'var(--cds-background)' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      <Grid>
        <Column lg={16} md={8} sm={4}>
          <div style={{ marginTop: '3rem', marginBottom: '2rem' }}>
            <h1 style={{ 
              fontSize: 'var(--cds-productive-heading-05, 2rem)', 
              fontWeight: 400, 
              marginBottom: '0.5rem', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem',
              color: 'var(--cds-text-primary)'
            }}>
              <UserAdmin size={32} />
              使用者管理
            </h1>
            <p style={{ 
              fontSize: 'var(--cds-body-long-01, 0.875rem)',
              color: 'var(--cds-text-secondary)' 
            }}>
              查看所有使用者並管理角色（可使用搜尋功能過濾）
            </p>
          </div>

          {/* Search Section */}
          <div className="carbon-panel" style={{ 
            padding: '1.5rem', 
            marginBottom: '2rem',
            backgroundColor: 'var(--cds-layer-01)',
            border: '1px solid var(--cds-border-subtle)'
          }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <TextInput
                  id="search"
                  labelText="搜尋使用者（選填）"
                  placeholder="輸入使用者名稱或 Email 進行過濾..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') handleSearch();
                  }}
                />
              </div>
              <Button
                kind="primary"
                renderIcon={Search}
                onClick={handleSearch}
                disabled={loading}
              >
                {loading ? '搜尋中...' : '搜尋'}
              </Button>
              {searchQuery && (
                <Button
                  kind="secondary"
                  onClick={() => {
                    setSearchQuery('');
                    loadAllUsers();
                  }}
                >
                  清除
                </Button>
              )}
            </div>

            {error && (
              <div style={{ marginTop: '1rem' }}>
                <InlineNotification
                  kind="error"
                  title="錯誤"
                  subtitle={error}
                  lowContrast
                  hideCloseButton
                />
              </div>
            )}

            {success && (
              <div style={{ marginTop: '1rem' }}>
                <InlineNotification
                  kind="success"
                  title="成功"
                  subtitle={success}
                  lowContrast
                  hideCloseButton
                />
              </div>
            )}
          </div>

          {/* Results Table */}
          {users.length > 0 && (
            <div className="carbon-panel" style={{ 
              padding: '1.5rem',
              backgroundColor: 'var(--cds-layer-01)',
              border: '1px solid var(--cds-border-subtle)'
            }}>
              <h2 style={{ 
                fontSize: 'var(--cds-heading-03, 1.25rem)', 
                fontWeight: 400, 
                marginBottom: '1rem',
                color: 'var(--cds-text-primary)'
              }}>
                搜尋結果 ({users.length})
              </h2>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeader>使用者名稱</TableHeader>
                      <TableHeader>Email</TableHeader>
                      <TableHeader>目前角色</TableHeader>
                      <TableHeader>登入方式</TableHeader>
                      <TableHeader>Email 驗證</TableHeader>
                      <TableHeader>操作</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>{user.username}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Tag type={user.role === 'admin' ? 'blue' : user.role === 'teacher' ? 'red' : 'gray'}>
                            {getRoleLabel(user.role)}
                          </Tag>
                        </TableCell>
                        <TableCell>{getProviderLabel(user.auth_provider)}</TableCell>
                        <TableCell>
                          {user.email_verified ? (
                            <CheckmarkFilled size={20} style={{ color: 'var(--cds-support-success)' }} />
                          ) : (
                            <span style={{ color: 'var(--cds-support-error)' }}>未驗證</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <Select
                              id={`role-select-${user.id}`}
                              labelText=""
                              value={user.role}
                              onChange={(e) => handleRoleChangeClick(user, e.target.value)}
                              size="sm"
                              style={{ minWidth: '120px' }}
                            >
                              <SelectItem value="student" text="學生" />
                              <SelectItem value="teacher" text="教師" />
                              <SelectItem value="admin" text="管理員 (TA)" />
                            </Select>
                            <Button
                              kind="danger--ghost"
                              size="sm"
                              renderIcon={TrashCan}
                              onClick={() => handleDeleteClick(user)}
                              hasIconOnly
                              iconDescription="刪除用戶"
                            >
                              刪除
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </div>
          )}
        </Column>
      </Grid>
      </div>

      {/* Confirmation Modal */}
      <Modal
        open={confirmModalOpen}
        onRequestClose={() => !updating && setConfirmModalOpen(false)}
        modalHeading="確認變更角色"
        primaryButtonText={updating ? '更新中...' : '確認'}
        secondaryButtonText="取消"
        onRequestSubmit={handleConfirmRoleChange}
        onSecondarySubmit={() => setConfirmModalOpen(false)}
        primaryButtonDisabled={updating}
        preventCloseOnClickOutside={updating}
      >
        <p>
          確定要將 <strong>{selectedUser?.username}</strong> 的角色從{' '}
          <strong>{selectedUser && getRoleLabel(selectedUser.role)}</strong> 變更為{' '}
          <strong>{getRoleLabel(newRole)}</strong> 嗎？
        </p>
        {newRole === 'admin' && (
          <p style={{ marginTop: '1rem', color: 'var(--cds-link-primary)' }}>
            ⓘ 設為管理員後，該使用者將獲得完整的系統管理權限。
          </p>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={isDeleteModalOpen}
        modalHeading="確認刪除用戶"
        primaryButtonText="刪除"
        secondaryButtonText="取消"
        onRequestClose={() => setIsDeleteModalOpen(false)}
        onRequestSubmit={handleDeleteConfirm}
        danger
      >
        <p>確定要刪除用戶 <strong>{userToDelete?.email}</strong> 嗎？</p>
        <p style={{ marginTop: '1rem', color: 'var(--cds-text-error)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <WarningAlt size={16} /> 此操作無法復原！用戶的所有數據將被永久刪除。
        </p>
      </Modal>
    </div>
  );
};

export default UserManagementPage;
