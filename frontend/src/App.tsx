import {
  BrowserRouter,
  Navigate,
  useParams,
} from "react-router-dom";
import { Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { HelmetProvider } from "react-helmet-async";
import i18n from "@/i18n";
import MainLayout from "@/features/app/components/MainLayout";
import ErrorBoundary from "@/features/app/components/ErrorBoundary";

// Feature imports - modular routes
import {
  guestRoutes,
  oauthCallbackRoute,
  settingsRoute,
  AuthLayout,
  AuthProvider,
  RequireAuth,
  RequireGuest,
  RequireAdmin,
  RequireTeacherOrAdmin,
} from "@/features/auth";
import { problemRoutes, problemDetailRoutes, problemSolveRoutes, problemEditRoutes } from "@/features/problems";
import { contestListRoute, contestDetailRoutes, contestAdminRoute, examPreviewRoute, examPrecheckRoute } from "@/features/contest";
import { dashboardRoute } from "@/features/dashboard";
import { docsRoutes, DocsLayout } from "@/features/docs";
import { errorRoutes, fallbackRoute } from "@/features/app";
import { storybookRoute } from "@/features/storybook";
import { adminRoutes } from "@/features/admin";
import { teacherRoutes } from "@/features/teacher";
import { landingRoute } from "@/features/landing";
import { classroomDetailRoute } from "@/features/classroom";
import { questionBankListRoute, questionBankDetailRoute } from "@/features/question-banks";

// Feature imports - Submissions
import { submissionRoutes } from "@/features/submissions";

// Context providers
import { ApiErrorProvider, ToastProvider, ContentLanguageProvider } from "@/shared/contexts";
import { ThemeProvider } from "@/shared/ui/theme/ThemeContext";
import {
  MarkdownImageUploadProvider,
} from "@/shared/ui/markdown/markdownEditor";
import { uploadMarkdownImage } from "@/infrastructure/api/repositories/markdown.repository";


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

type AdminPanelParam = "settings" | "participants" | "logs" | "exam";

function LegacyContestAdminRedirect({ panel }: { panel?: AdminPanelParam }) {
  const { contestId } = useParams<{ contestId: string }>();
  if (!contestId) {
    return <Navigate to="/contests" replace />;
  }
  const query = panel ? `?panel=${panel}` : "";
  return <Navigate to={`/contests/${contestId}/admin${query}`} replace />;
}

function App() {
  const markdownImageUploader = async (file: File) => {
    const result = await uploadMarkdownImage(file);
    return {
      url: result.url,
      markdown: result.markdown,
      contentType: result.content_type,
      size: result.size,
    };
  };

  return (
    <HelmetProvider>
      <ErrorBoundary>
        <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <ContentLanguageProvider>
              <ThemeProvider>
                <MarkdownImageUploadProvider uploadImage={markdownImageUploader}>
                  <AuthProvider>
                    <BrowserRouter>
                      <ApiErrorProvider>
                      <Routes>
                        {/* Auth Routes - shared AuthLayout for login/register/callback */}
                        <Route element={<AuthLayout />}>
                          <Route element={<RequireGuest />}>
                            {guestRoutes}
                          </Route>
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
                            {settingsRoute}
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

                          {/* Classroom Detail - Standalone classroom admin shell */}
                          {classroomDetailRoute}

                          {/* Exam Precheck - Standalone, shared by coding & paper_exam */}
                          {examPrecheckRoute}

                        </Route>

                        {/* Teacher/Admin Routes */}
                        <Route element={<RequireTeacherOrAdmin />}>
                          <Route element={<MainLayout />}>
                            {questionBankListRoute}
                            {/* Teacher Dashboard Routes */}
                            {teacherRoutes}
                            {/* Redirect old management paths to unified contest view */}
                            <Route
                              path="/management/contests/:contestId"
                              element={<LegacyContestAdminRedirect panel="settings" />}
                            />
                            <Route
                              path="/management/contests/:contestId/settings"
                              element={<LegacyContestAdminRedirect panel="settings" />}
                            />
                            <Route
                              path="/management/contests/:contestId/problems"
                              element={<LegacyContestAdminRedirect panel="exam" />}
                            />
                            <Route
                              path="/management/contests/:contestId/participants"
                              element={<LegacyContestAdminRedirect panel="participants" />}
                            />
                            <Route
                              path="/management/contests/:contestId/logs"
                              element={<LegacyContestAdminRedirect panel="logs" />}
                            />
                          </Route>

                          {/* Contest Admin Dashboard - Standalone full page */}
                          {contestAdminRoute}
                          {questionBankDetailRoute}

                          {/* Exam Preview - Standalone full page (Demo mode) */}
                          {examPreviewRoute}
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
                </MarkdownImageUploadProvider>
              </ThemeProvider>
            </ContentLanguageProvider>
          </ToastProvider>
        </QueryClientProvider>
      </I18nextProvider>
    </ErrorBoundary>
    </HelmetProvider>
  );
}

export default App;
