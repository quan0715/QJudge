import { Outlet } from 'react-router-dom';
import { Content, Theme } from '@carbon/react';
import { GlobalHeader } from '@/ui/components/GlobalHeader';

import { useTheme } from '@/ui/theme/ThemeContext';

const MainLayout = () => {
  const { theme } = useTheme();
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Theme theme={theme}>
        <GlobalHeader />
        <Content className="main-content" style={{ 
            flex: 1,
            padding: 0,
            minHeight: 'calc(100svh - 2rem)',
            backgroundColor: 'var(--cds-background)' }}>
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
