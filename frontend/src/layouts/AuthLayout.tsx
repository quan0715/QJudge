import { Outlet } from 'react-router-dom';
// import { Grid, Column } from '@carbon/react';

const AuthLayout = () => {
  return (
    <div style={{ minHeight: '100vh', width: '100%' }}>
      <Outlet />
    </div>
  );
};

export default AuthLayout;
