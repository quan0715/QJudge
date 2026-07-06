/**
 * Auth Repository Implementation
 *
 * Handles login, registration, password reset, and session lifecycle.
 */

import { httpClient, requestJson, ensureOk } from "@/infrastructure/api/http.client";
import type {
  LoginCredentials,
  RegisterCredentials,
} from "@/core/entities/auth.entity";
import type {
  AuthResponseDto,
  AuthOptionsResponseDto,
  MagicLinkIssueResponseDto,
  MagicLinkInspectResponseDto,
  MagicLinkRedeemResponseDto,
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

export const requestPasswordReset = async (email: string): Promise<void> => {
  await ensureOk(
    httpClient.post("/api/v1/auth/forgot-password", { email }),
    "Failed to request password reset"
  );
};

export const logoutOtherDevices = async (): Promise<void> => {
  await ensureOk(httpClient.post("/api/v1/auth/me/logout-other-devices"), "Failed to logout other devices");
};

// ============================================================================
// Magic Links
// ============================================================================

export const issueTeacherActivationMagicLink = async (
  email: string
): Promise<MagicLinkIssueResponseDto> => {
  return requestJson<MagicLinkIssueResponseDto>(
    httpClient.post("/api/v1/magic-links", { purpose: "teacher_activation", email }),
    "Failed to issue invite"
  );
};

export const inspectMagicLink = async (
  token: string
): Promise<MagicLinkInspectResponseDto> => {
  return requestJson<MagicLinkInspectResponseDto>(
    httpClient.get(`/api/v1/magic-links/${encodeURIComponent(token)}`),
    "Failed to inspect magic link"
  );
};

export const redeemMagicLink = async (
  token: string
): Promise<MagicLinkRedeemResponseDto> => {
  return requestJson<MagicLinkRedeemResponseDto>(
    httpClient.post(`/api/v1/magic-links/${encodeURIComponent(token)}/redeem`, {}),
    "Failed to redeem magic link"
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

export const getLoginRecords = async (): Promise<LoginRecordsResponseDto> => {
  return requestJson<LoginRecordsResponseDto>(
    httpClient.get("/api/v1/auth/me/login-records"),
    "Failed to fetch login records"
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
  requestPasswordReset,
  logoutOtherDevices,
  issueTeacherActivationMagicLink,
  inspectMagicLink,
  redeemMagicLink,
  getOAuthUrl,
  oauthCallback,
  getLoginRecords,
};

export default authRepository;
