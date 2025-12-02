import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from '@/layouts/MainLayout';
import AuthLayout from '@/layouts/AuthLayout';
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';
import OAuthCallbackPage from '@/pages/auth/OAuthCallbackPage';
import ProblemListPage from '@/pages/problem/ProblemListPage';
import ProblemDetailPage from '@/pages/problem/ProblemDetailPage';
import SubmissionsPage from '@/pages/submission/SubmissionsPage';
import SubmissionDetailPage from '@/pages/submission/SubmissionDetailPage';
import DashboardPage from '@/pages/DashboardPage';
import ContestListPage from '@/pages/contests/ContestListPage';
import ContestDashboard from '@/pages/contests/ContestDashboard';
import ContestProblemPage from '@/pages/contests/ContestProblemPage';
import ContestSubmissionListPage from '@/pages/contests/ContestSubmissionListPage';

import ContestSubmissionDetailPage from '@/pages/contests/ContestSubmissionDetailPage';
import ContestStandingsPage from '@/pages/contests/ContestStandingsPage';
// import ContestSettingsPage from '@/pages/contests/ContestSettingsPage';
import ContestQAPage from '@/pages/contests/ContestQAPage';
import ContestLayout from '@/layouts/ContestLayout';
import UserManagementPage from '@/pages/admin/UserManagementPage';
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

function App() {
  return (
    <ThemeProvider>
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
                <Route path="/submissions/:id" element={<SubmissionDetailPage />} />
                
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
              <Route path="submissions/:submissionId" element={<ContestSubmissionDetailPage />} />
              <Route path="standings" element={<ContestStandingsPage />} />
              {/* <Route path="settings" element={<ContestSettingsPage />} /> */}
              <Route path="clarifications" element={<ContestQAPage />} />
            </Route>
          </Route>

          {/* Teacher/Admin Routes */}
          <Route element={<RequireTeacherOrAdmin />}>
            <Route element={<MainLayout />}>
              <Route path="/admin/problems" element={<ProblemManagementPage />} />
              <Route path="/admin/problems/new" element={<ProblemFormPage />} />
              <Route path="/admin/problems/:id/edit" element={<ProblemFormPage />} />
              
              {/* Teacher Contest Management */}
              <Route path="/teacher/contests" element={<Navigate to="/contests" replace />} />
              <Route path="/contests/new" element={<ContestCreatePage />} />
              <Route path="/teacher/contests/new" element={<Navigate to="/contests/new" replace />} />
              <Route path="/teacher/contests/:id/edit" element={<Navigate to="/admin/contests/:id" replace />} />
              <Route path="/teacher/contests/:contestId/problems/:problemId/edit" element={<TeacherContestProblemEditPage />} />
            </Route>

            {/* New Contest Admin Routes */}
            <Route path="/admin/contests/:contestId" element={<ContestAdminLayout />}>
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
            </Route>
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
