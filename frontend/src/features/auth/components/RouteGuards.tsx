import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import PageLoading from '@/shared/ui/PageLoading';
import { getAuthedLandingPath, hasCompletedOnboarding } from "../utils/onboarding";

export const RequireAuth = () => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoading fullScreen />;

  if (!user) {
    // Redirect to landing page for unauthenticated users
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
};

export const RequireGuest = () => {
  const { user, loading } = useAuth();

  if (loading) return <PageLoading fullScreen />;

  if (user) {
    return <Navigate to={getAuthedLandingPath(user)} replace />;
  }

  return <Outlet />;
};

export const RequirePendingOnboarding = () => {
  const { user, loading } = useAuth();

  if (loading) return <PageLoading fullScreen />;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (hasCompletedOnboarding(user)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};

export const RequireCompletedOnboarding = () => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoading fullScreen />;

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!hasCompletedOnboarding(user)) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
};

export const RequireAdmin = () => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoading fullScreen />;

  if (!user) {
    // Redirect to landing page for unauthenticated users
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

  if (loading) return <PageLoading fullScreen />;

  if (!user) {
    // Redirect to landing page for unauthenticated users
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user.role !== 'teacher' && user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};
