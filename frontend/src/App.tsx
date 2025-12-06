import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from '@/layouts/MainLayout';
import AuthLayout from '@/layouts/AuthLayout';
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';
import OAuthCallbackPage from '@/pages/auth/OAuthCallbackPage';
import ProblemListPage from '@/pages/problem/ProblemListPage';
import ProblemDetailPage from '@/pages/problem/ProblemDetailPage';
import SubmissionsPage from '@/pages/submission/SubmissionsPage';
import DashboardPage from '@/pages/DashboardPage';
import ContestListPage from '@/pages/contests/ContestListPage';
import ContestDashboard from '@/pages/contests/ContestDashboard';
import ContestProblemPage from '@/pages/contests/ContestProblemPage';
import ContestSubmissionListPage from '@/pages/contests/ContestSubmissionListPage';
import ContestStandingsPage from '@/pages/contests/ContestStandingsPage';
// import ContestSettingsPage from '@/pages/contests/ContestSettingsPage';
import ContestQAPage from '@/pages/contests/ContestQAPage';
import ContestLayout from '@/layouts/ContestLayout';
import UserManagementPage from '@/pages/admin/UserManagementPage';
import AnnouncementManagementPage from '@/pages/admin/AnnouncementManagementPage';
import ProblemManagementPage from '@/pages/admin/ProblemManagementPage';
import ProblemFormPage from '@/pages/admin/ProblemFormPage';
import TeacherContestProblemEditPage from '@/pages/contests/TeacherContestProblemEditPage';
import ContestCreatePage from '@/pages/contests/ContestCreatePage';
import { RequireAuth, RequireGuest, RequireAdmin, RequireTeacherOrAdmin } from '@/components/RouteGuards';

// Contest Admin Pages
import ContestAdminLayout from '@/layouts/ContestAdminLayout';
import ContestAdminOverview from '@/pages/contest-admin/ContestAdminOverview';
import ContestAdminSettingsPage from '@/pages/contest-admin/ContestSettingsPage';
import ContestAdminProblemsPage from '@/pages/contest-admin/ContestProblemsPage';
import ContestAdminParticipantsPage from '@/pages/contest-admin/ContestParticipantsPage';
import ContestAdminLogsPage from '@/pages/contest-admin/ContestLogsPage';
 
import { ThemeProvider } from '@/contexts/ThemeContext';

import { AuthProvider } from '@/contexts/AuthContext';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
        <Routes>
          {/* Guest Routes (Login/Register) */}
          <Route element={<RequireGuest />}>
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/auth/nycu/callback" element={<OAuthCallbackPage />} />
            </Route>
          </Route>


          {/* Protected Routes (Dashboard, Problems, etc.) */}
          <Route element={<RequireAuth />}>
            <Route element={<MainLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/problems" element={<ProblemListPage />} />
                <Route path="/problems/:id" element={<ProblemDetailPage />} />
                
                {/* Submissions */}
                <Route path="/submissions" element={<SubmissionsPage />} />
                {/* Removed /submissions/:id route - using modal instead */}
                
              <Route path="/contests" element={<ContestListPage />} />
              <Route path="/ranking" element={<div>Ranking Page (Coming Soon)</div>} />
              {/* Redirect root to dashboard */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
            </Route>
            {/* Contest Routes - Outside MainLayout with Custom Header */}
            <Route path="/contests/:contestId" element={<ContestLayout />}>
              <Route index element={<ContestDashboard />} />
              <Route path="problems" element={<ContestDashboard />} /> {/* Temporary redirect or list */}
              <Route path="problems/:problemId" element={<ContestProblemPage />} />
              <Route path="submissions" element={<ContestSubmissionListPage />} />
              {/* Removed submissions/:submissionId route - using modal instead */}
              <Route path="standings" element={<ContestStandingsPage />} />
              {/* <Route path="settings" element={<ContestSettingsPage />} /> */}
              <Route path="clarifications" element={<ContestQAPage />} />
            </Route>
          </Route>

          {/* Teacher/Admin Routes */}
          <Route element={<RequireTeacherOrAdmin />}>
            <Route element={<MainLayout />}>
              <Route path="/management/problems" element={<ProblemManagementPage />} />
              <Route path="/management/problems/new" element={<ProblemFormPage />} />
              <Route path="/management/problems/:id/edit" element={<ProblemFormPage />} />
              
              {/* Teacher Contest Management */}
              <Route path="/teacher/contests" element={<Navigate to="/contests" replace />} />
              <Route path="/contests/new" element={<ContestCreatePage />} />
              <Route path="/teacher/contests/new" element={<Navigate to="/contests/new" replace />} />
              <Route path="/teacher/contests/:id/edit" element={<Navigate to="/management/contests/:id" replace />} />
              <Route path="/teacher/contests/:contestId/problems/:problemId/edit" element={<TeacherContestProblemEditPage />} />
            </Route>

            {/* New Contest Management Routes */}
            <Route path="/management/contests/:contestId" element={<ContestAdminLayout />}>
              <Route index element={<ContestAdminOverview />} />
              <Route path="settings" element={<ContestAdminSettingsPage />} />
              <Route path="problems" element={<ContestAdminProblemsPage />} />
              <Route path="participants" element={<ContestAdminParticipantsPage />} />
              <Route path="logs" element={<ContestAdminLogsPage />} />
            </Route>
          </Route>

          {/* Admin Only Routes */}
          <Route element={<RequireAdmin />}>
            <Route element={<MainLayout />}>
              <Route path="/admin/users" element={<UserManagementPage />} />
              <Route path="/management/announcements" element={<AnnouncementManagementPage />} />
            </Route>
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
