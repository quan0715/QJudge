import { Route } from "react-router-dom";
import LoginScreen from "./screens/LoginScreen";
import RegisterScreen from "./screens/RegisterScreen";
import OAuthCallbackScreen from "./screens/OAuthCallbackScreen";
import UserSettingsScreen from "./screens/UserSettingsScreen";

/**
 * Guest 路由（需在 RequireGuest + AuthLayout 內使用）
 */
export const guestRoutes = (
  <>
    <Route path="/login" element={<LoginScreen />} />
    <Route path="/register" element={<RegisterScreen />} />
  </>
);

/**
 * OAuth Callback 路由（需在 AuthLayout 內使用，不需要 Guard）
 */
export const oauthCallbackRoute = (
  <Route path="/auth/nycu/callback" element={<OAuthCallbackScreen />} />
);

/**
 * Settings 路由（需在 RequireAuth + MainLayout 內使用）
 */
export const settingsRoute = (
  <Route path="/settings" element={<UserSettingsScreen />} />
);
