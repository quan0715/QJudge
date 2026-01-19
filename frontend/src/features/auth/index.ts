// Auth Feature - Main exports

// Routes
export { guestRoutes, oauthCallbackRoute } from "./routes";

// Screens
export { default as LoginScreen } from "./screens/LoginScreen";
export { default as RegisterScreen } from "./screens/RegisterScreen";
export { default as OAuthCallbackScreen } from "./screens/OAuthCallbackScreen";

// Components
export { default as AuthLayout } from "./components/layout/AuthLayout";
export { default as MatrixBackground } from "./components/MatrixBackground";
export { default as ChangePasswordModal } from "./components/ChangePasswordModal";
export { default as UserSettingsModal } from "./components/UserSettingsModal";
export {
  RequireAuth,
  RequireGuest,
  RequireAdmin,
  RequireTeacherOrAdmin,
} from "./components/RouteGuards";

// Context
export { AuthProvider, useAuth } from "./contexts/AuthContext";
