import { HeaderGlobalAction, HeaderPanel, Switcher, SwitcherItem, SwitcherDivider } from '@carbon/react';
import { UserAvatar, Logout, User as UserIcon } from '@carbon/icons-react';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';

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
    localStorage.removeItem('token');
    localStorage.removeItem('user');
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
          {(user.role === 'teacher' || user.role === 'admin') && (
            <>
              <SwitcherItem onClick={() => { navigate('/admin/problems'); setIsUserMenuOpen(false); }} aria-label="Manage Problems">
                Manage Problems
              </SwitcherItem>
              <SwitcherItem onClick={() => { navigate('/teacher/contests'); setIsUserMenuOpen(false); }} aria-label="Manage Contests">
                Manage Contests
              </SwitcherItem>
            </>
          )}
          {user.role === 'admin' && (
            <SwitcherItem onClick={() => { navigate('/admin/users'); setIsUserMenuOpen(false); }} aria-label="Manage Users">
              Manage Users
            </SwitcherItem>
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
