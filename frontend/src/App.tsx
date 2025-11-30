import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import OAuthCallbackPage from './pages/OAuthCallbackPage';
import ProblemListPage from './pages/ProblemListPage';
import ProblemDetailPage from './pages/ProblemDetailPage';
import SubmissionsPage from './pages/SubmissionsPage';
import SubmissionDetailPage from './pages/SubmissionDetailPage';
import DashboardPage from './pages/DashboardPage';
import ContestListPage from './pages/ContestListPage';
import ContestDashboardPage from './pages/ContestDashboardPage';
import ContestProblemPage from './pages/ContestProblemPage';
import ContestSubmissionListPage from './pages/ContestSubmissionListPage';
import ContestSubmissionDetailPage from './pages/ContestSubmissionDetailPage';
import ContestStandingsPage from './pages/ContestStandingsPage';
import ContestLayout from './layouts/ContestLayout';
import UserManagementPage from './pages/UserManagementPage';
import ProblemManagementPage from './pages/ProblemManagementPage';
import ProblemFormPage from './pages/ProblemFormPage';
import TeacherContestListPage from './pages/TeacherContestListPage';
import TeacherContestEditPage from './pages/TeacherContestEditPage';
import TeacherContestProblemEditPage from './pages/TeacherContestProblemEditPage';
import { RequireAuth, RequireGuest, RequireAdmin, RequireTeacherOrAdmin } from './components/RouteGuards';

function App() {
  return (
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
            <Route index element={<ContestDashboardPage />} />
            <Route path="problems/:problemId" element={<ContestProblemPage />} />
            <Route path="submissions" element={<ContestSubmissionListPage />} />
            <Route path="submissions/:submissionId" element={<ContestSubmissionDetailPage />} />
            <Route path="standings" element={<ContestStandingsPage />} />
          </Route>
        </Route>

        {/* Teacher/Admin Routes */}
        <Route element={<RequireTeacherOrAdmin />}>
          <Route element={<MainLayout />}>
            <Route path="/admin/problems" element={<ProblemManagementPage />} />
            <Route path="/admin/problems/new" element={<ProblemFormPage />} />
            <Route path="/admin/problems/:id/edit" element={<ProblemFormPage />} />
            
            {/* Teacher Contest Management */}
            <Route path="/teacher/contests" element={<TeacherContestListPage />} />
            <Route path="/teacher/contests/new" element={<TeacherContestEditPage />} />
            <Route path="/teacher/contests/:id/edit" element={<Navigate to="/contests/:id" replace />} />
            <Route path="/teacher/contests/:contestId/problems/:problemId/edit" element={<TeacherContestProblemEditPage />} />
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
  );
}

export default App;
