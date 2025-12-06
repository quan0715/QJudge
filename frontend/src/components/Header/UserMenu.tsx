import { HeaderGlobalAction, HeaderPanel, Switcher, SwitcherItem, SwitcherDivider } from '@carbon/react';
import { UserAvatar, Logout, User as UserIcon } from '@carbon/icons-react';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { clearAuthStorage } from '@/services/auth';

interface User {
  username: string;
  role: string;
}

const UserMenu = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  useEffect(() => {
    const checkUser = () => {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        try {
          setUser(JSON.parse(userStr));
        } catch (e) {
          console.error("Failed to parse user data", e);
          setUser(null);
        }
      } else {
        setUser(null);
      }
    };

    checkUser();
    window.addEventListener('storage', checkUser);
    return () => window.removeEventListener('storage', checkUser);
  }, []);

  const handleLogout = () => {
    clearAuthStorage();
    setUser(null);
    setIsUserMenuOpen(false);
    navigate('/');
  };

  if (!user) {
    return (
      <HeaderGlobalAction aria-label="Login" tooltipAlignment="center" onClick={() => navigate('/login')}>
        <UserAvatar size={20} />
      </HeaderGlobalAction>
    );
  }

  return (
    <>
      <HeaderGlobalAction 
        aria-label="User Menu" 
        isActive={isUserMenuOpen}
        onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
        tooltipAlignment="center"
      >
        <UserAvatar size={20} />
      </HeaderGlobalAction>
      <HeaderPanel aria-label="User Menu" expanded={isUserMenuOpen}>
        <Switcher aria-label="User Menu">
          <SwitcherItem aria-label="User Info">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'default', color: 'var(--cds-text-primary)' }}>
              <UserIcon />
              <span>{user.role === 'student' ? '學生' : user.role} - {user.username}</span>
            </div>
          </SwitcherItem>
          <SwitcherDivider />
          <SwitcherItem onClick={() => { navigate('/dashboard'); setIsUserMenuOpen(false); }} aria-label="Dashboard">
            Dashboard
          </SwitcherItem>
           <SwitcherItem onClick={() => { navigate('/problems'); setIsUserMenuOpen(false); }} aria-label="Problems">
            Problems
          </SwitcherItem>
           <SwitcherItem onClick={() => { navigate('/contests'); setIsUserMenuOpen(false); }} aria-label="Contests">
            Contests
          </SwitcherItem>
          <SwitcherItem onClick={() => { navigate('/submissions'); setIsUserMenuOpen(false); }} aria-label="Submissions">
            Submissions
          </SwitcherItem>
          {(user.role === 'teacher' || user.role === 'admin') && (
            <>
              <SwitcherItem onClick={() => { navigate('/management/problems'); setIsUserMenuOpen(false); }} aria-label="Manage Problems">
                Manage Problems
              </SwitcherItem>
              <SwitcherItem onClick={() => { navigate('/teacher/contests'); setIsUserMenuOpen(false); }} aria-label="Manage Contests">
                Manage Contests
              </SwitcherItem>
            </>
          )}
          {user.role === 'admin' && (
            <>
              <SwitcherItem onClick={() => { navigate('/management/announcements'); setIsUserMenuOpen(false); }} aria-label="管理公告">
                管理公告
              </SwitcherItem>
              <SwitcherItem onClick={() => { navigate('/admin/users'); setIsUserMenuOpen(false); }} aria-label="Manage Users">
                Manage Users
              </SwitcherItem>
              <SwitcherItem aria-label="API Documentation" href="/api/schema/swagger-ui/" target="_blank" rel="noopener noreferrer">
                API Documentation
              </SwitcherItem>
              <SwitcherItem aria-label="Django Admin" href="/django-admin/">
                Django Admin
              </SwitcherItem>
            </>
          )}
          <SwitcherDivider />
          <SwitcherItem onClick={handleLogout} aria-label="Logout">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--cds-support-error)' }}>
              <Logout />
              <span>Logout</span>
            </div>
          </SwitcherItem>
        </Switcher>
      </HeaderPanel>
    </>
  );
};

export default UserMenu;
