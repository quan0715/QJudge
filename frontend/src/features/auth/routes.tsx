import { Route } from "react-router-dom";
import LoginScreen from "./screens/LoginScreen";
import RegisterScreen from "./screens/RegisterScreen";
import CampusSsoScreen from "./screens/CampusSsoScreen";
import OAuthCallbackScreen from "./screens/OAuthCallbackScreen";
import UserSettingsScreen from "./screens/UserSettingsScreen";

/**
 * Guest 路由（需在 RequireGuest + AuthLayout 內使用）
 */
export const guestRoutes = (
  <>
    <Route path="/login" element={<LoginScreen />} />
    <Route path="/login/campus-sso" element={<CampusSsoScreen />} />
    <Route path="/register" element={<RegisterScreen />} />
  </>
);

/**
 * OAuth Callback 路由（需在 AuthLayout 內使用，不需要 Guard）
 * 支援所有 provider: /auth/:provider/callback (nycu, github, google)
 */
export const oauthCallbackRoute = (
  <Route path="/auth/:provider/callback" element={<OAuthCallbackScreen />} />
);

/**
 * Settings 路由（需在 RequireAuth + MainLayout 內使用）
 */
export const settingsRoute = (
  <Route path="/settings" element={<UserSettingsScreen />} />
);
