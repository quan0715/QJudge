import { useState, useEffect } from 'react';
import { 
  Search, 
  UserAdmin, 
  CheckmarkFilled, 
  WarningFilled,
  TrashCan
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
  TableContainer
  } from '@carbon/react';
import { authFetch } from '../services/auth';
import { api } from '../services/api';

interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  auth_provider: string;
  email_verified: boolean;
  last_login_at: string | null;
  is_active: boolean;
}

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
      const response = await api.searchUsers('');  // Empty query = all users
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
      const response = await api.searchUsers(searchQuery);
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
      const response = await api.updateUserRole(selectedUser.id, newRole);
      if (response.success) {
        setSuccess(response.message || '角色更新成功');
        // Update user in list
        setUsers(users.map(u => 
          u.id === selectedUser.id ? { ...u, role: newRole } : u
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
        const res = await authFetch(`/api/v1/auth/${userToDelete.id}/`, {
          method: 'DELETE'
        });

      if (res.ok) {
        setSuccess(`已刪除用戶 ${userToDelete.email}`);
        // Refresh user list
        loadAllUsers();
      } else {
        const errorData = await res.json();
        setError(errorData.detail || '無法刪除用戶');
      }
    } catch (err) {
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

  const getProviderLabel = (provider: string) => {
    const labels: Record<string, string> = {
      'email': 'Email/密碼',
      'nycu-oauth': 'NYCU OAuth',
      'google': 'Google',
      'github': 'GitHub'
    };
    return labels[provider] || provider;
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <UserAdmin size={32} />
          使用者管理
        </h1>
        <p style={{ color: 'var(--cds-text-secondary)' }}>
          查看所有使用者並管理角色（可使用搜尋功能過濾）
        </p>
      </div>

      {/* Search Section */}
      <div className="carbon-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
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
          <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#fff1f1', border: '1px solid #da1e28', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <WarningFilled size={20} style={{ color: '#da1e28' }} />
            <span style={{ color: '#da1e28' }}>{error}</span>
          </div>
        )}

        {success && (
          <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#defbe6', border: '1px solid #24a148', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckmarkFilled size={20} style={{ color: '#24a148' }} />
            <span style={{ color: '#24a148' }}>{success}</span>
          </div>
        )}
      </div>

      {/* Results Table */}
      {users.length > 0 && (
        <div className="carbon-panel" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>
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
                      <span style={{ 
                        padding: '0.25rem 0.5rem', 
                        borderRadius: '4px', 
                        fontSize: '0.875rem',
                        backgroundColor: user.role === 'admin' ? '#e5f6ff' : user.role === 'teacher' ? '#fff1f1' : '#f4f4f4',
                        color: user.role === 'admin' ? '#0043ce' : user.role === 'teacher' ? '#da1e28' : '#525252'
                      }}>
                        {getRoleLabel(user.role)}
                      </span>
                    </TableCell>
                    <TableCell>{getProviderLabel(user.auth_provider)}</TableCell>
                    <TableCell>
                      {user.email_verified ? (
                        <CheckmarkFilled size={20} style={{ color: '#24a148' }} />
                      ) : (
                        <span style={{ color: '#da1e28' }}>未驗證</span>
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
          <p style={{ marginTop: '1rem', color: '#0043ce' }}>
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
        <p style={{ marginTop: '1rem', color: '#da1e28' }}>
          ⚠️ 此操作無法復原！用戶的所有數據將被永久刪除。
        </p>
      </Modal>
    </div>
  );
};

export default UserManagementPage;
