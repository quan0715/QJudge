import { fetchEnvelope } from "@/infrastructure/api/envelope";
/**
 * Auth Repository Implementation
 *
 * Handles login, registration, provider auth, and session lifecycle.
 */

import { httpClient } from "@/infrastructure/api/http.client";
import type {
  LoginCredentials,
  RegisterCredentials,
} from "@/core/entities/auth.entity";
import type {
  AuthResponseDto,
  AuthOptionsResponseDto,
  ActionLinkIssueResponseDto,
  ActionLinkInspectResponseDto,
  ActionLinkRedeemResponseDto,
  LoginRecordsResponseDto,
} from "@/infrastructure/api/dto/auth.dto";

// ============================================================================
// Auth Repository Implementation
// ============================================================================

export const login = async (
  credentials: LoginCredentials
): Promise<AuthResponseDto> => {
  return fetchEnvelope<AuthResponseDto["data"]>(
    httpClient.post("/api/v1/auth/login/password", credentials),
    "Login failed"
  );
};

export const register = async (
  credentials: RegisterCredentials
): Promise<AuthResponseDto> => {
  return fetchEnvelope<AuthResponseDto["data"]>(
    httpClient.post("/api/v1/auth/register/password", credentials),
    "Registration failed"
  );
};

export const getAuthOptions = async (): Promise<AuthOptionsResponseDto> => {
  return fetchEnvelope<AuthOptionsResponseDto["data"]>(
    httpClient.get("/api/v1/auth/providers"),
    "Failed to fetch auth options"
  );
};

export const logout = async (): Promise<void> => {
  await fetchEnvelope<null>(httpClient.post("/api/v1/auth/logout"), "Logout failed");
};

export const logoutOtherSessions = async (): Promise<void> => {
  await fetchEnvelope<null>(httpClient.post("/api/v1/auth/sessions/logout-others"), "Failed to logout other sessions");
};

// ============================================================================
// Action Links
// ============================================================================

export const issueTeacherActivationActionLink = async (
  email: string
): Promise<ActionLinkIssueResponseDto> => {
  return fetchEnvelope<ActionLinkIssueResponseDto["data"]>(
    httpClient.post("/api/v1/action-links", { purpose: "teacher_activation", email }),
    "Failed to issue invite"
  );
};

export const inspectActionLink = async (
  token: string
): Promise<ActionLinkInspectResponseDto> => {
  return fetchEnvelope<ActionLinkInspectResponseDto["data"]>(
    httpClient.get(`/api/v1/action-links/${encodeURIComponent(token)}`),
    "Failed to inspect action link"
  );
};

export const redeemActionLink = async (
  token: string
): Promise<ActionLinkRedeemResponseDto> => {
  return fetchEnvelope<ActionLinkRedeemResponseDto["data"]>(
    httpClient.post(`/api/v1/action-links/${encodeURIComponent(token)}/redeem`, {}),
    "Failed to redeem action link"
  );
};

// ============================================================================
// OAuth
// ============================================================================

export const getOAuthUrl = async (provider: string, redirect?: string): Promise<string> => {
  const query = redirect ? `?redirect=${encodeURIComponent(redirect)}` : "";
  const response = await fetchEnvelope<{ authorization_url: string }>(
    httpClient.get(`/api/v1/auth/login/${provider}${query}`),
    "Failed to get OAuth URL"
  );
  return response?.data?.authorization_url || "";
};

export const oauthCallback = async (provider: string, code: string): Promise<AuthResponseDto> => {
  const redirectUri =
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/${provider}/callback`
      : `http://localhost:5173/auth/${provider}/callback`;
  return fetchEnvelope<AuthResponseDto["data"]>(
    httpClient.post(`/api/v1/auth/callback/${provider}`, { code, redirect_uri: redirectUri }),
    "OAuth callback failed"
  );
};

export const getAuthSessions = async (): Promise<LoginRecordsResponseDto> => {
  return fetchEnvelope<LoginRecordsResponseDto["data"]>(
    httpClient.get("/api/v1/auth/sessions"),
    "Failed to fetch auth sessions"
  );
};

export const requestPasswordReset = (identifier: string) =>
  fetchEnvelope<null>(httpClient.post("/api/v1/auth/password/reset-requests", { identifier }), "Unable to request password reset");

export const completePasswordReset = (token: string, password: string, passwordConfirm: string) =>
  fetchEnvelope<null>(httpClient.post(`/api/v1/auth/password/resets/${encodeURIComponent(token)}`, {
    password, password_confirm: passwordConfirm,
  }), "Unable to reset password");
