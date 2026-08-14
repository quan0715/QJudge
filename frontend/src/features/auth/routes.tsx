import { lazy } from "react";
import { Route } from "react-router";
import { RouteLoadingBoundary } from "@/shared/ui/RouteLoadingBoundary";
import OAuthCallbackScreen from "./screens/OAuthCallbackScreen";

const LoginScreen = lazy(() => import("./screens/LoginScreen"));
const RegisterScreen = lazy(() => import("./screens/RegisterScreen"));
const CampusSsoScreen = lazy(() => import("./screens/CampusSsoScreen"));
const OnboardingScreen = lazy(() => import("./screens/OnboardingScreen"));
const InviteLinkScreen = lazy(() => import("./screens/InviteLinkScreen"));
const OAuthAuthorizeScreen = lazy(() => import("./screens/OAuthAuthorizeScreen"));

const routeScreen = (screen: React.ReactNode) => (
  <RouteLoadingBoundary>{screen}</RouteLoadingBoundary>
);

/**
 * Guest 路由（需在 RequireGuest + AuthLayout 內使用）
 */
export const guestRoutes = (
  <>
    <Route path="/login" element={routeScreen(<LoginScreen />)} />
    <Route path="/login/campus-sso" element={routeScreen(<CampusSsoScreen />)} />
    <Route path="/register" element={routeScreen(<RegisterScreen />)} />
    <Route path="/register/campus-sso" element={routeScreen(<CampusSsoScreen />)} />
  </>
);

/**
 * OAuth Callback 路由（需在 AuthLayout 內使用，不需要 Guard）
 * 支援所有 provider: /auth/:provider/callback (nycu, github, google)
 */
export const oauthCallbackRoute = (
  <Route
    path="/auth/:provider/callback"
    element={routeScreen(<OAuthCallbackScreen />)}
  />
);

export const onboardingRoute = (
  <Route path="/onboarding" element={routeScreen(<OnboardingScreen />)} />
);

export const inviteLinkRoute = (
  <Route path="/invite/:token" element={routeScreen(<InviteLinkScreen />)} />
);

export const oauthAuthorizeRoute = (
  <Route
    path="/oauth/authorize"
    element={routeScreen(<OAuthAuthorizeScreen />)}
  />
);
