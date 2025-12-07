import { Outlet } from 'react-router-dom';
import { Content } from '@carbon/react';
import { GlobalHeader } from '../components/GlobalHeader';

const MainLayout = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <GlobalHeader />
      <Content style={{ flex: 1, backgroundColor: 'var(--cds-background)' }}>
        <Outlet />
      </Content>
    </div>
  );
};

export default MainLayout;
