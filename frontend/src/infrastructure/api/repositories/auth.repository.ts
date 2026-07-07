/**
 * Auth Repository Implementation
 *
 * Handles login, registration, provider auth, and session lifecycle.
 */

import { httpClient, requestJson, ensureOk } from "@/infrastructure/api/http.client";
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
  return requestJson<AuthResponseDto>(
    httpClient.post("/api/v1/auth/login/password", credentials),
    "Login failed"
  );
};

export const register = async (
  credentials: RegisterCredentials
): Promise<AuthResponseDto> => {
  return requestJson<AuthResponseDto>(
    httpClient.post("/api/v1/auth/register/password", credentials),
    "Registration failed"
  );
};

export const getAuthOptions = async (): Promise<AuthOptionsResponseDto> => {
  return requestJson<AuthOptionsResponseDto>(
    httpClient.get("/api/v1/auth/providers"),
    "Failed to fetch auth options"
  );
};

export const logout = async (): Promise<void> => {
  await ensureOk(httpClient.post("/api/v1/auth/logout"), "Logout failed");
};

export const logoutOtherSessions = async (): Promise<void> => {
  await ensureOk(httpClient.post("/api/v1/auth/sessions/logout-others"), "Failed to logout other sessions");
};

// ============================================================================
// Action Links
// ============================================================================

export const issueTeacherActivationActionLink = async (
  email: string
): Promise<ActionLinkIssueResponseDto> => {
  return requestJson<ActionLinkIssueResponseDto>(
    httpClient.post("/api/v1/action-links", { purpose: "teacher_activation", email }),
    "Failed to issue invite"
  );
};

export const inspectActionLink = async (
  token: string
): Promise<ActionLinkInspectResponseDto> => {
  return requestJson<ActionLinkInspectResponseDto>(
    httpClient.get(`/api/v1/action-links/${encodeURIComponent(token)}`),
    "Failed to inspect action link"
  );
};

export const redeemActionLink = async (
  token: string
): Promise<ActionLinkRedeemResponseDto> => {
  return requestJson<ActionLinkRedeemResponseDto>(
    httpClient.post(`/api/v1/action-links/${encodeURIComponent(token)}/redeem`, {}),
    "Failed to redeem action link"
  );
};

// ============================================================================
// OAuth
// ============================================================================

export const getOAuthUrl = async (provider: string, redirect?: string): Promise<string> => {
  const query = redirect ? `?redirect=${encodeURIComponent(redirect)}` : "";
  const response = await requestJson<{ success: boolean; data?: { authorization_url?: string } }>(
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
  return requestJson<AuthResponseDto>(
    httpClient.post(`/api/v1/auth/callback/${provider}`, { code, redirect_uri: redirectUri }),
    "OAuth callback failed"
  );
};

export const getAuthSessions = async (): Promise<LoginRecordsResponseDto> => {
  return requestJson<LoginRecordsResponseDto>(
    httpClient.get("/api/v1/auth/sessions"),
    "Failed to fetch auth sessions"
  );
};

// ============================================================================
// Repository Instance
// ============================================================================

export const authRepository = {
  login,
  register,
  getAuthOptions,
  logout,
  logoutOtherSessions,
  issueTeacherActivationActionLink,
  inspectActionLink,
  redeemActionLink,
  getOAuthUrl,
  oauthCallback,
  getAuthSessions,
};

export default authRepository;
