import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from '@/ui/layout/MainLayout';
import AuthLayout from '@/domains/auth/components/layout/AuthLayout';
import LoginPage from '@/domains/auth/pages/LoginPage';
import RegisterPage from '@/domains/auth/pages/RegisterPage';
import OAuthCallbackPage from '@/domains/auth/pages/OAuthCallbackPage';
import ProblemList from '@/domains/problem/pages/ProblemList';
import ProblemDetail from '@/domains/problem/pages/ProblemDetail';
import ProblemLayout from '@/domains/problem/components/layout/ProblemLayout';
import SubmissionsPage from '@/domains/submission/pages/SubmissionsPage';
import DashboardPage from '@/app/pages/DashboardPage';
import ContestListPage from '@/domains/contest/pages/ContestListPage';
import ContestDashboard from '@/domains/contest/pages/ContestDashboard';
import ContestProblemPage from '@/domains/contest/pages/ContestProblemPage';
import ContestSubmissionListPage from '@/domains/contest/pages/ContestSubmissionListPage';
import ContestStandingsPage from '@/domains/contest/pages/ContestStandingsPage';
// import ContestSettingsPage from '@/pages/contests/ContestSettingsPage';
import ContestQAPage from '@/domains/contest/pages/ContestQAPage';
import ContestLayout from '@/domains/contest/components/layout/ContestLayout';
import UserManagementPage from '@/domains/admin/pages/UserManagementPage';
import AnnouncementManagementPage from '@/domains/admin/pages/AnnouncementManagementPage';
import ProblemManagementPage from '@/domains/admin/pages/ProblemManagementPage';
import ProblemFormPage from '@/domains/admin/pages/ProblemFormPage';
import TeacherContestProblemEditPage from '@/domains/contest/pages/TeacherContestProblemEditPage';
import ContestCreatePage from '@/domains/contest/pages/ContestCreatePage';
import { RequireAuth, RequireGuest, RequireAdmin, RequireTeacherOrAdmin } from '@/domains/auth/components/RouteGuards';

// Contest Admin Pages
import ContestAdminLayout from '@/domains/contest/components/layout/ContestAdminLayout';
import ContestAdminOverview from '@/domains/contest/pages/admin/ContestAdminOverview';
import ContestAdminSettingsPage from '@/domains/contest/pages/admin/ContestSettingsPage';
import ContestAdminProblemsPage from '@/domains/contest/pages/admin/ContestProblemsPage';
import ContestAdminParticipantsPage from '@/domains/contest/pages/admin/ContestParticipantsPage';
import ContestAdminLogsPage from '@/domains/contest/pages/admin/ContestLogsPage';
 
import { ThemeProvider } from '@/ui/theme/ThemeContext';

import { AuthProvider } from '@/domains/auth/contexts/AuthContext';

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
            </Route>
          </Route>

          {/* OAuth Callback - not protected, handles its own auth flow */}
          <Route element={<AuthLayout />}>
            <Route path="/auth/nycu/callback" element={<OAuthCallbackPage />} />
          </Route>


          {/* Protected Routes (Dashboard, Problems, etc.) */}
          <Route element={<RequireAuth />}>
            <Route element={<MainLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/problems" element={<ProblemList />} />
                
                {/* Submissions */}
                <Route path="/submissions" element={<SubmissionsPage />} />
                
              <Route path="/contests" element={<ContestListPage />} />
              <Route path="/ranking" element={<div>Ranking Page (Coming Soon)</div>} />
              {/* Redirect root to dashboard */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
            </Route>
            
            {/* Problem Detail - Outside MainLayout with Custom ProblemLayout */}
            <Route path="/problems/:id" element={<ProblemLayout />}>
              <Route index element={<ProblemDetail />} />
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
