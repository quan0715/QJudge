import {
  BrowserRouter,
  Navigate,
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
  onboardingRoute,
  teacherActivationRoute,
  oauthAuthorizeRoute,
  AuthLayout,
  AuthProvider,
  RequireAuth,
  RequireGuest,
  RequireAdmin,
  RequireTeacherOrAdmin,
  RequirePendingOnboarding,
  RequireCompletedOnboarding,
  SettingsDialogProvider,
  SettingsDialog,
} from "@/features/auth";
import { problemDetailRoutes, problemSolveRoutes } from "@/features/problems";
import { classroomContestDetailRoutes, classroomContestAdminRoute, classroomExamPreviewRoute, classroomExamPrecheckRoute, classroomPracticeRoute } from "@/features/contest";
import { dashboardRoute } from "@/features/dashboard";
import { docsRoutes, DocsLayout } from "@/features/docs";
import { changelogRoutes } from "@/features/changelog";
import { errorRoutes, fallbackRoute } from "@/features/app";
import { adminRoutes, draftProblemsRoute } from "@/features/admin";
import { landingRoute } from "@/features/landing";
import { checkoutSuccessRoute, pricingRoute } from "@/features/pricing";
import RecurProviderBridge from "@/features/pricing/components/RecurProviderBridge";
import { classroomDetailRoute, classroomJoinRoute } from "@/features/classroom";
import { questionBankMarketplaceRoute, questionBankDetailRoute } from "@/features/question-banks";
import { lazy, Suspense } from "react";

const ChatStandalonePage = lazy(() => import("@/features/chatbot/components/ChatStandalonePage"));

// Context providers
import { ApiErrorProvider, ToastProvider, ContentLanguageProvider } from "@/shared/contexts";
import { PageHeaderActionsProvider } from "@/features/app/contexts/PageHeaderActionsContext";
import { ChatSessionProvider } from "@/features/chatbot/contexts/ChatSessionContext";
import { WorkspaceProvider } from "@/features/app/contexts/WorkspaceContext";
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

function LegacyProblemListRedirect() {
  return <Navigate to="/dashboard" replace />;
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
                    <SettingsDialogProvider>
                    <RecurProviderBridge>
                    <BrowserRouter>
                      <ChatSessionProvider>
                      <WorkspaceProvider>
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
                          {teacherActivationRoute}
                          <Route element={<RequireAuth />}>
                            <Route element={<RequirePendingOnboarding />}>
                              {onboardingRoute}
                            </Route>
                          </Route>
                        </Route>

                        {/* Public Documentation Routes - no login required, custom layout */}
                        <Route element={<DocsLayout />}>
                          {docsRoutes}
                          {changelogRoutes}
                        </Route>

                        {/* Public Landing Page */}
                        {landingRoute}
                        {pricingRoute}

                        {/* Public Checkout Success */}
                        {checkoutSuccessRoute}

                        {/* Classroom Join - public route, handles own auth redirect */}
                        {classroomJoinRoute}

                        {/* Protected Routes (Dashboard, Problems, etc.) */}
                        <Route element={<RequireAuth />}>
                          <Route element={<RequireCompletedOnboarding />}>
                            <Route element={<MainLayout />}>
                              {dashboardRoute}
                              <Route
                                path="/ranking"
                                element={<div>Ranking Page (Coming Soon)</div>}
                              />
                              {/* Classroom Detail - inside MainLayout for shared sidebar */}
                              {classroomDetailRoute}
                            </Route>

                            {/* Legacy hidden routes */}
                            <Route path="/problems" element={<LegacyProblemListRedirect />} />
                            {/* Problem Detail - Outside MainLayout with Custom ProblemLayout */}
                            {problemDetailRoutes}

                            {/* Problem Solve - Full-screen IDE-style solver */}
                            {problemSolveRoutes}

                            {/* Classroom-scoped Contest Routes */}
                            {classroomContestDetailRoutes}

                            {/* Classroom Exam Precheck - Classroom-scoped */}
                            {classroomExamPrecheckRoute}
                          </Route>

                        </Route>

                        {/* Teacher/Admin Routes */}
                        <Route element={<RequireTeacherOrAdmin />}>
                          <Route element={<RequireCompletedOnboarding />}>
                            <Route element={<MainLayout />}>
                              {questionBankMarketplaceRoute}
                              {draftProblemsRoute}
                              {/* Classroom Contest Admin - Classroom-scoped, inside shared workspace shell */}
                              {classroomContestAdminRoute}
                              <Route
                                path="/chat"
                                element={
                                  <Suspense fallback={null}>
                                    <ChatStandalonePage />
                                  </Suspense>
                                }
                              />
                              <Route
                                path="/chat/:sessionId"
                                element={
                                  <Suspense fallback={null}>
                                    <ChatStandalonePage />
                                  </Suspense>
                                }
                              />
                            </Route>

                            {/* Question Bank Detail - Standalone with breadcrumb header */}
                            {questionBankDetailRoute}

                            {/* Classroom Exam Preview - Classroom-scoped */}
                            {classroomExamPreviewRoute}

                            {/* Classroom Practice - Classroom-scoped */}
                            {classroomPracticeRoute}
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
                      </WorkspaceProvider>
                      </ChatSessionProvider>
                    </BrowserRouter>
                    <SettingsDialog />
                    </RecurProviderBridge>
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
