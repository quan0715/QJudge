import { Route } from "react-router";
import LoginScreen from "./screens/LoginScreen";
import RegisterScreen from "./screens/RegisterScreen";
import CampusSsoScreen from "./screens/CampusSsoScreen";
import OAuthCallbackScreen from "./screens/OAuthCallbackScreen";
import OnboardingScreen from "./screens/OnboardingScreen";
import MagicLinkScreen from "./screens/MagicLinkScreen";
import OAuthAuthorizePage from "./screens/OAuthAuthorizePage";

/**
 * Guest 路由（需在 RequireGuest + AuthLayout 內使用）
 */
export const guestRoutes = (
  <>
    <Route path="/login" element={<LoginScreen />} />
    <Route path="/login/campus-sso" element={<CampusSsoScreen />} />
    <Route path="/register" element={<RegisterScreen />} />
    <Route path="/register/campus-sso" element={<CampusSsoScreen />} />
  </>
);

/**
 * OAuth Callback 路由（需在 AuthLayout 內使用，不需要 Guard）
 * 支援所有 provider: /auth/:provider/callback (nycu, github, google)
 */
export const oauthCallbackRoute = (
  <Route path="/auth/:provider/callback" element={<OAuthCallbackScreen />} />
);

export const onboardingRoute = (
  <Route path="/onboarding" element={<OnboardingScreen />} />
);

export const magicLinkRoute = (
  <Route path="/magic-links/:token" element={<MagicLinkScreen />} />
);

export const oauthAuthorizeRoute = (
  <Route path="/oauth/authorize" element={<OAuthAuthorizePage />} />
);
