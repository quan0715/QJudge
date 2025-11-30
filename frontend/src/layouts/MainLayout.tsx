import { Outlet } from 'react-router-dom';
import { Content, Theme } from '@carbon/react';
import AppHeader from '@/components/Header';

import { useTheme } from '@/contexts/ThemeContext';

const MainLayout = () => {
  const { theme } = useTheme();
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Theme theme={theme}>
        <AppHeader />
        <Content className="main-content" style={{ flex: 1, minHeight: 'calc(100svh - 2rem)' }}>
          <Outlet />
        </Content>
        <footer style={{ padding: '2rem', textAlign: 'center', backgroundColor: 'var(--cds-layer-01)' }}>
          <p>© 2025 National Yang Ming Chiao Tung University</p>
        </footer>
      </Theme>
    </div>
  );
};

export default MainLayout;
