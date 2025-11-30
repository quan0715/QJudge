import { Outlet } from 'react-router-dom';
import { Content, Theme } from '@carbon/react';
import AppHeader from '../components/Header';

const MainLayout = () => {
  return (
    <>
      <Theme theme="g100">
        <AppHeader />
      </Theme>
      <Content className="main-content">
        <Outlet />
      </Content>
      <footer style={{ padding: '2rem', textAlign: 'center', backgroundColor: 'var(--cds-layer-01)', marginTop: 'auto' }}>
        <p>© 2025 National Yang Ming Chiao Tung University</p>
      </footer>
    </>
  );
};

export default MainLayout;
