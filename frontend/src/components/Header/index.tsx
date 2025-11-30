import { Header, HeaderName, HeaderNavigation, HeaderMenuItem, HeaderGlobalBar, HeaderGlobalAction, SkipToContent } from '@carbon/react';
import { Notification as NotificationIcon, Light, Asleep } from '@carbon/icons-react';
import { Link } from 'react-router-dom';
import UserMenu from './UserMenu';
import { useTheme } from '@/contexts/ThemeContext';

const AppHeader = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <Header aria-label="NYCU Online Judge" className="header-separator">
      <SkipToContent />
      <HeaderName as={Link} to="/" prefix="NYCU">
        Online Judge
      </HeaderName>
      <HeaderNavigation aria-label="NYCU Online Judge">
        <HeaderMenuItem as={Link} to="/problems">Problems</HeaderMenuItem>
        <HeaderMenuItem as={Link} to="/submissions">Submissions</HeaderMenuItem>
        <HeaderMenuItem as={Link} to="/contests">Contests</HeaderMenuItem>
      </HeaderNavigation>
      <HeaderGlobalBar>
        <HeaderGlobalAction 
          aria-label={theme === 'white' ? 'Switch to Dark Mode' : 'Switch to Light Mode'} 
          tooltipAlignment="center"
          onClick={toggleTheme}
        >
          {theme === 'white' ? <Asleep size={20} /> : <Light size={20} />}
        </HeaderGlobalAction>
        <HeaderGlobalAction aria-label="Notifications" tooltipAlignment="center">
          <NotificationIcon size={20} />
        </HeaderGlobalAction>
        <UserMenu />
      </HeaderGlobalBar>
    </Header>
  );
};

export default AppHeader;
