import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import PageLoading from '@/shared/ui/PageLoading';
import { getClassroom } from '@/infrastructure/api/repositories/classroom.repository';
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

export const RequireClassroomManager = () => {
  const { classroomId, contestId } = useParams<{
    classroomId: string;
    contestId?: string;
  }>();
  const [canManage, setCanManage] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    setCanManage(null);

    if (!classroomId) {
      setCanManage(false);
      return () => {
        active = false;
      };
    }

    void getClassroom(classroomId).then((classroom) => {
      if (!active) return;
      setCanManage(
        classroom?.currentUserRole === 'platform_admin' ||
        classroom?.currentUserRole === 'owner' ||
        classroom?.currentUserRole === 'manager',
      );
    }).catch(() => {
      if (active) setCanManage(false);
    });

    return () => {
      active = false;
    };
  }, [classroomId]);

  if (canManage === null) return <PageLoading fullScreen />;
  if (canManage) return <Outlet />;

  const fallback = classroomId && contestId
    ? `/classrooms/${classroomId}/contest/${contestId}`
    : '/dashboard';
  return <Navigate to={fallback} replace />;
};
