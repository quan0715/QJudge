import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import MainLayout from "@/features/app/components/MainLayout";
import ErrorBoundary from "@/features/app/components/ErrorBoundary";

// Feature imports - modular routes
import {
  guestRoutes,
  oauthCallbackRoute,
  AuthLayout,
  AuthProvider,
  RequireAuth,
  RequireGuest,
  RequireAdmin,
  RequireTeacherOrAdmin,
} from "@/features/auth";
import { problemRoutes, problemDetailRoutes, problemSolveRoutes, problemEditRoutes } from "@/features/problems";
import { contestListRoute, contestDetailRoutes } from "@/features/contest";
import { dashboardRoute } from "@/features/dashboard";
import { docsRoutes, DocsLayout } from "@/features/docs";
import { errorRoutes, fallbackRoute } from "@/features/app";
import { storybookRoute } from "@/features/storybook";
import { adminRoutes } from "@/features/admin";
import { landingRoute } from "@/features/landing";

// Feature imports - Submissions
import { submissionRoutes } from "@/features/submissions";

// Context providers
import { ApiErrorProvider, ToastProvider, ContentLanguageProvider } from "@/shared/contexts";
import { ThemeProvider } from "@/shared/ui/theme/ThemeContext";

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
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <ContentLanguageProvider>
              <ThemeProvider>
                <AuthProvider>
                  <BrowserRouter>
                    <ApiErrorProvider>
                      <Routes>
                        {/* Guest Routes (Login/Register) */}
                        <Route element={<RequireGuest />}>
                          <Route element={<AuthLayout />}>{guestRoutes}</Route>
                        </Route>

                        {/* OAuth Callback - not protected, handles its own auth flow */}
                        <Route element={<AuthLayout />}>
                          {oauthCallbackRoute}
                        </Route>

                        {/* Public Documentation Routes - no login required, custom layout */}
                        <Route element={<DocsLayout />}>{docsRoutes}</Route>

                        {/* Public Landing Page */}
                        {landingRoute}

                        {/* Protected Routes (Dashboard, Problems, etc.) */}
                        <Route element={<RequireAuth />}>
                          <Route element={<MainLayout />}>
                            {dashboardRoute}
                            {problemRoutes}
                            {contestListRoute}
                            {submissionRoutes}
                            <Route
                              path="/ranking"
                              element={<div>Ranking Page (Coming Soon)</div>}
                            />
                          </Route>

                          {/* Problem Detail - Outside MainLayout with Custom ProblemLayout */}
                          {problemDetailRoutes}

                          {/* Problem Solve - Full-screen IDE-style solver */}
                          {problemSolveRoutes}

                          {/* Problem Edit - Full-screen editor (admin/teacher only) */}
                          {problemEditRoutes}

                          {/* Contest Routes - Outside MainLayout with Custom Header */}
                          {contestDetailRoutes}
                        </Route>

                        {/* Teacher/Admin Routes - Legacy redirects */}
                        <Route element={<RequireTeacherOrAdmin />}>
                          <Route element={<MainLayout />}>
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
                                <Navigate
                                  to="/contests/:contestId?tab=logs"
                                  replace
                                />
                              }
                            />
                          </Route>
                        </Route>

                        {/* Admin Only Routes (using /system/ to avoid conflict with Django /admin/) */}
                        <Route element={<RequireAdmin />}>
                          <Route element={<MainLayout />}>{adminRoutes}</Route>
                        </Route>

                        {/* Dev-only Storybook Route */}
                        {import.meta.env.DEV && storybookRoute}

                        {/* Error Pages - accessible without auth */}
                        {errorRoutes}

                        {/* Fallback - 404 for unmatched routes */}
                        {fallbackRoute}
                      </Routes>
                    </ApiErrorProvider>
                  </BrowserRouter>
                </AuthProvider>
              </ThemeProvider>
            </ContentLanguageProvider>
          </ToastProvider>
        </QueryClientProvider>
      </I18nextProvider>
    </ErrorBoundary>
  );
}

export default App;
