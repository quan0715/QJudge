import { Header, HeaderName, HeaderNavigation, HeaderMenuItem, HeaderGlobalBar, HeaderGlobalAction, SkipToContent } from '@carbon/react';
import { Notification as NotificationIcon } from '@carbon/icons-react';
import { Link } from 'react-router-dom';
import UserMenu from './UserMenu';

const AppHeader = () => {
  return (
    <Header aria-label="NYCU Online Judge">
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
        <HeaderGlobalAction aria-label="Notifications" tooltipAlignment="center">
          <NotificationIcon size={20} />
        </HeaderGlobalAction>
        <UserMenu />
      </HeaderGlobalBar>
    </Header>
  );
};

export default AppHeader;
