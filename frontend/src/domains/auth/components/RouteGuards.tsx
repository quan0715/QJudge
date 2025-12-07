import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loading } from '@carbon/react';

const PageLoading = () => (
  <div style={{ 
    height: '100vh', 
    width: '100vw', 
    display: 'flex', 
    justifyContent: 'center', 
    alignItems: 'center',
    backgroundColor: 'var(--cds-background)'
  }}>
    <Loading description="Loading..." withOverlay={false} />
  </div>
);

export const RequireAuth = () => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoading />;

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
};

export const RequireGuest = () => {
  const { user, loading } = useAuth();

  if (loading) return <PageLoading />;

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};

export const RequireAdmin = () => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoading />;

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};

export const RequireTeacherOrAdmin = () => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoading />;

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user.role !== 'teacher' && user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};
