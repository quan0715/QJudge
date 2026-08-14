import { BrowserRouter } from "react-router-dom";
import { Routes, Route } from "react-router";
import { lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { HelmetProvider } from "react-helmet-async";

import i18n from "@/i18n";
import MainLayout from "@/features/app/components/MainLayout";
import ErrorBoundary from "@/features/app/components/ErrorBoundary";
import {
  guestRoutes,
  oauthCallbackRoute,
  onboardingRoute,
  inviteLinkRoute,
  oauthAuthorizeRoute,
} from "@/features/auth/routes";
import AuthLayout from "@/features/auth/components/layout/AuthLayout";
import { AuthProvider } from "@/features/auth/contexts/AuthContext";
import {
  RequireAuth,
  RequireGuest,
  RequireAdmin,
  RequireTeacherOrAdmin,
  RequirePendingOnboarding,
  RequireCompletedOnboarding,
} from "@/features/auth/components/RouteGuards";
import { SettingsDialogProvider } from "@/features/auth/contexts/SettingsDialogContext";
import SettingsDialogHost from "@/features/auth/components/SettingsDialogHost";
import UserPreferencesHydrator from "@/features/auth/components/UserPreferencesHydrator";
import {
  problemDetailRoutes,
  problemSolveRoutes,
} from "@/features/problems/routes";
import {
  classroomContestRouteChildren,
  classroomContestAdminRoute,
  classroomContestAttendanceProjectionRoute,
  classroomContestAttendanceScanRoute,
  classroomExamPreviewRoute,
  classroomExamPrecheckRoute,
} from "@/features/contest/routes";
import ContestWorkspaceLayout from "@/features/contest/components/layout/ContestWorkspaceLayout";
import { dashboardRoute } from "@/features/dashboard/routes";
import { docsRoutes } from "@/features/docs/routes";
import DocsLayout from "@/features/docs/components/DocsLayout";
import { errorRoutes, fallbackRoute } from "@/features/app/routes";
import { adminRoutes, draftProblemsRoute } from "@/features/admin/routes";
import { landingRoute } from "@/features/landing/routes";
import { classroomDetailRoute } from "@/features/classroom/routes";
import { questionBankDetailRoute } from "@/features/question-banks/routes";

const ChatStandalonePage = lazy(() => import("@/features/chatbot/components/ChatStandalonePage"));

// Context providers
import { ApiErrorProvider, ToastProvider, ContentLanguageProvider } from "@/shared/contexts";
import { PageHeaderActionsProvider } from "@/features/app/contexts/PageHeaderActionsContext";
import { QJudgeCopilotProvider } from "@/features/chatbot/contexts/QJudgeCopilotProvider";
import { WorkspaceProvider } from "@/features/app/contexts/WorkspaceContext";
import { ThemeProvider } from "@/shared/ui/theme/ThemeContext";
import { RouteLoadingBoundary } from "@/shared/ui/RouteLoadingBoundary";
import { MarkdownImageUploadProvider } from "@/shared/ui/markdown/markdownEditor/MarkdownImageUploadContext";
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

async function markdownImageUploader(file: File) {
  const result = await uploadMarkdownImage(file);
  return {
    url: result.url,
    markdown: result.markdown,
    contentType: result.content_type,
    size: result.size,
  };
}

function App() {
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
                    <UserPreferencesHydrator />
                    <SettingsDialogProvider>
                    <BrowserRouter>
                      <WorkspaceProvider>
                      <QJudgeCopilotProvider>
                      <PageHeaderActionsProvider>
                      <ApiErrorProvider>
                      <Routes>
                        {/* Auth Routes - shared AuthLayout for login/register/callback */}
                        <Route element={<AuthLayout />}>
                          <Route element={<RequireGuest />}>
                            {guestRoutes}
                          </Route>
                          {oauthCallbackRoute}
                          {oauthAuthorizeRoute}
                          {inviteLinkRoute}
                          <Route element={<RequireAuth />}>
                            <Route element={<RequirePendingOnboarding />}>
                              {onboardingRoute}
                            </Route>
                          </Route>
                        </Route>

                        {/* Public Documentation Routes - no login required, custom layout */}
                        <Route element={<DocsLayout />}>
                          {docsRoutes}
                        </Route>

                        {/* Public Landing Page */}
                        {landingRoute}

                        {/* Protected Routes (Dashboard, Problems, etc.) */}
                        <Route element={<RequireAuth />}>
                          <Route element={<RequireCompletedOnboarding />}>
                            <Route element={<MainLayout />}>
                              {dashboardRoute}
                              {/* Classroom Detail - inside MainLayout for shared sidebar */}
                              {classroomDetailRoute}
                            </Route>

                            {/* Classroom Contest - ContestProvider wraps MainLayout/WorkspaceShell */}
                            <Route
                              path="/classrooms/:classroomId/contest/:contestId"
                              element={<ContestWorkspaceLayout />}
                            >
                              <Route element={<MainLayout />}>
                                {classroomContestRouteChildren}
                              </Route>
                            </Route>

                            {/* Problem Detail - Outside MainLayout with Custom ProblemLayout */}
                            {problemDetailRoutes}

                            {/* Problem Solve - Full-screen IDE-style solver */}
                            {problemSolveRoutes}

                            {/* Classroom Exam Precheck - Classroom-scoped */}
                            {classroomExamPrecheckRoute}
                            {classroomContestAttendanceScanRoute}
                          </Route>

                        </Route>

                        {/* Teacher/Admin Routes */}
                        <Route element={<RequireTeacherOrAdmin />}>
                          <Route element={<RequireCompletedOnboarding />}>
                            <Route element={<MainLayout />}>
                              {questionBankDetailRoute}
                              {draftProblemsRoute}
                              {/* Classroom Contest Admin - Classroom-scoped, inside shared workspace shell */}
                              {classroomContestAdminRoute}
                              <Route
                                path="/chat"
                                element={
                                  <RouteLoadingBoundary>
                                    <ChatStandalonePage />
                                  </RouteLoadingBoundary>
                                }
                              />
                            </Route>

                            {/* Classroom Exam Preview - Classroom-scoped */}
                            {classroomContestAttendanceProjectionRoute}
                            {classroomExamPreviewRoute}

                          </Route>
                        </Route>

                        {/* Admin Only Routes (using /system/ to avoid conflict with Django /admin/) */}
                        <Route element={<RequireAdmin />}>
                          <Route element={<RequireCompletedOnboarding />}>
                            <Route element={<MainLayout />}>{adminRoutes}</Route>
                          </Route>
                        </Route>

                        {/* Error Pages - accessible without auth */}
                        {errorRoutes}

                        {/* Fallback - 404 for unmatched routes */}
                        {fallbackRoute}
                      </Routes>
                      </ApiErrorProvider>
                      </PageHeaderActionsProvider>
                      </QJudgeCopilotProvider>
                      </WorkspaceProvider>
                    </BrowserRouter>
                    <SettingsDialogHost />
                    </SettingsDialogProvider>
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
