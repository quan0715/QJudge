import { Outlet } from 'react-router-dom';

const AuthLayout = () => {
  return (
    <div style={{ minHeight: '100vh', width: '100%' }}>
      <Outlet />
    </div>
  );
};

export default AuthLayout;
