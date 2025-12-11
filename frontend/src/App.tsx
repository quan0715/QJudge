import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MainLayout from "@/ui/layout/MainLayout";
import AuthLayout from "@/domains/auth/components/layout/AuthLayout";
import LoginPage from "@/domains/auth/pages/LoginPage";
import RegisterPage from "@/domains/auth/pages/RegisterPage";
import OAuthCallbackPage from "@/domains/auth/pages/OAuthCallbackPage";
import ProblemList from "@/domains/problem/pages/ProblemList";
import ProblemDetail from "@/domains/problem/pages/ProblemDetail";
import ProblemLayout from "@/domains/problem/components/layout/ProblemLayout";
import SubmissionsPage from "@/domains/submission/pages/SubmissionsPage";
import DashboardPage from "@/app/pages/DashboardPage";
import ContestListPage from "@/domains/contest/pages/ContestListPage";
import ContestDashboard from "@/domains/contest/pages/ContestDashboard";
import ContestProblemPage from "@/domains/contest/pages/ContestProblemPage";
import ContestLayout from "@/domains/contest/components/layout/ContestLayout";
import UserManagementPage from "@/domains/admin/pages/UserManagementPage";
import AnnouncementManagementPage from "@/domains/admin/pages/AnnouncementManagementPage";
import EnvironmentPage from "@/domains/admin/pages/EnvironmentPage";
import ProblemManagementPage from "@/domains/admin/pages/ProblemManagementPage";
import ProblemFormPage from "@/domains/admin/pages/ProblemFormPage";
import ContestCreatePage from "@/domains/contest/pages/ContestCreatePage";
import ErrorBoundary from "@/ui/components/ErrorBoundary";
import {
  RequireAuth,
  RequireGuest,
  RequireAdmin,
  RequireTeacherOrAdmin,
} from "@/domains/auth/components/RouteGuards";

// Admin pages are now rendered as tabs in ContestDashboard

import { ThemeProvider } from "@/ui/theme/ThemeContext";

import { AuthProvider } from "@/domains/auth/contexts/AuthContext";

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute - data considered fresh
      gcTime: 1000 * 60 * 5, // 5 minutes - cache retention
      refetchOnWindowFocus: false, // Don't refetch on window focus
      retry: 1, // Retry once on failure
    },
  },
});

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
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
                  <Route
                    path="/auth/nycu/callback"
                    element={<OAuthCallbackPage />}
                  />
                </Route>

                {/* Protected Routes (Dashboard, Problems, etc.) */}
                <Route element={<RequireAuth />}>
                  <Route element={<MainLayout />}>
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/problems" element={<ProblemList />} />

                    {/* Submissions */}
                    <Route path="/submissions" element={<SubmissionsPage />} />

                    <Route path="/contests" element={<ContestListPage />} />
                    <Route
                      path="/ranking"
                      element={<div>Ranking Page (Coming Soon)</div>}
                    />
                    {/* Redirect root to dashboard */}
                    <Route
                      path="/"
                      element={<Navigate to="/dashboard" replace />}
                    />
                  </Route>

                  {/* Problem Detail - Outside MainLayout with Custom ProblemLayout */}
                  <Route path="/problems/:id" element={<ProblemLayout />}>
                    <Route index element={<ProblemDetail />} />
                  </Route>

                  {/* Contest Routes - Outside MainLayout with Custom Header */}
                  <Route
                    path="/contests/:contestId"
                    element={<ContestLayout />}
                  >
                    <Route index element={<ContestDashboard />} />
                    {/* Legacy route redirects to new query param structure */}
                    <Route
                      path="problems"
                      element={<Navigate to="../?tab=problems" replace />}
                    />
                    <Route
                      path="submissions"
                      element={<Navigate to="../?tab=submissions" replace />}
                    />
                    <Route
                      path="standings"
                      element={<Navigate to="../?tab=standings" replace />}
                    />
                    <Route
                      path="clarifications"
                      element={<Navigate to="../?tab=clarifications" replace />}
                    />

                    {/* Problem Solving Page */}
                    <Route
                      path="solve/:problemId"
                      element={<ContestProblemPage />}
                    />
                  </Route>
                </Route>

                {/* Teacher/Admin Routes */}
                <Route element={<RequireTeacherOrAdmin />}>
                  <Route element={<MainLayout />}>
                    <Route
                      path="/management/problems"
                      element={<ProblemManagementPage />}
                    />
                    <Route
                      path="/management/problems/new"
                      element={<ProblemFormPage />}
                    />
                    <Route
                      path="/management/problems/:id/edit"
                      element={<ProblemFormPage />}
                    />

                    {/* Teacher Contest Management - Redirect to unified view */}
                    <Route
                      path="/teacher/contests"
                      element={<Navigate to="/contests" replace />}
                    />
                    <Route
                      path="/contests/new"
                      element={<ContestCreatePage />}
                    />
                    <Route
                      path="/teacher/contests/new"
                      element={<Navigate to="/contests/new" replace />}
                    />
                    <Route
                      path="/teacher/contests/:id/edit"
                      element={
                        <Navigate to="/contests/:id?tab=settings" replace />
                      }
                    />

                    {/* Redirect old management paths to unified contest view */}
                    <Route
                      path="/management/contests/:contestId"
                      element={
                        <Navigate
                          to="/contests/:contestId?tab=settings"
                          replace
                        />
                      }
                    />
                    <Route
                      path="/management/contests/:contestId/settings"
                      element={
                        <Navigate
                          to="/contests/:contestId?tab=settings"
                          replace
                        />
                      }
                    />
                    <Route
                      path="/management/contests/:contestId/problems"
                      element={
                        <Navigate
                          to="/contests/:contestId?tab=manage-problems"
                          replace
                        />
                      }
                    />
                    <Route
                      path="/management/contests/:contestId/participants"
                      element={
                        <Navigate
                          to="/contests/:contestId?tab=participants"
                          replace
                        />
                      }
                    />
                    <Route
                      path="/management/contests/:contestId/logs"
                      element={
                        <Navigate to="/contests/:contestId?tab=logs" replace />
                      }
                    />
                  </Route>
                </Route>

                {/* Admin Only Routes (using /system/ to avoid conflict with Django /admin/) */}
                <Route element={<RequireAdmin />}>
                  <Route element={<MainLayout />}>
                    <Route
                      path="/system/users"
                      element={<UserManagementPage />}
                    />
                    <Route
                      path="/system/environment"
                      element={<EnvironmentPage />}
                    />
                    <Route
                      path="/management/announcements"
                      element={<AnnouncementManagementPage />}
                    />
                  </Route>
                </Route>

                {/* Fallback */}
                <Route
                  path="*"
                  element={<Navigate to="/dashboard" replace />}
                />
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
