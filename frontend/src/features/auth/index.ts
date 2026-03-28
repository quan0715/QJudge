// Auth Feature - Main exports

// Routes
export { guestRoutes, oauthCallbackRoute, onboardingRoute, teacherActivationRoute } from "./routes";

// Screens
export { default as LoginScreen } from "./screens/LoginScreen";
export { default as RegisterScreen } from "./screens/RegisterScreen";
export { default as OAuthCallbackScreen } from "./screens/OAuthCallbackScreen";
export { default as OnboardingScreen } from "./screens/OnboardingScreen";
export { default as TeacherActivationScreen } from "./screens/TeacherActivationScreen";

// Components
export { default as AuthLayout } from "./components/layout/AuthLayout";
export { default as ChangePasswordModal } from "./components/ChangePasswordModal";
export { default as UserSettingsModal } from "./components/UserSettingsModal";
export {
  RequireAuth,
  RequireGuest,
  RequireAdmin,
  RequireTeacherOrAdmin,
  RequirePendingOnboarding,
  RequireCompletedOnboarding,
} from "./components/RouteGuards";

// Context
export { AuthProvider, useAuth } from "./contexts/AuthContext";
export { SettingsDialogProvider, useSettingsDialog } from "./contexts/SettingsDialogContext";

// Settings Dialog
export { SettingsDialog } from "./components/SettingsDialog";
