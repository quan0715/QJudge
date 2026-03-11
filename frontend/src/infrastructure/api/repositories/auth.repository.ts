/**
 * Auth Repository Implementation
 *
 * Authentication, user management, and preferences.
 */

import {
  httpClient,
  requestJson,
  ensureOk,
  clearAuthStorage,
} from "@/infrastructure/api/http.client";
import type {
  AuthResponse,
  LoginCredentials,
  RegisterCredentials,
  PreferencesResponse,
  UpdatePreferencesRequest,
  ChangePasswordRequest,
  ChangePasswordResponse,
  CurrentUserResponse,
  ForgotPasswordRequest,
  APIKeyResponse,
  ResetPasswordRequest,
  SetAPIKeyRequest,
  UpdateAccountProfileRequest,
  UsageStatsResponse,
} from "@/core/entities/auth.entity";

const API_BASE = "/api/v1/auth";

// ============================================================================
// Authentication
// ============================================================================

export const login = async (data: LoginCredentials): Promise<AuthResponse> => {
  const res = await httpClient.post(`${API_BASE}/email/login`, data);
  if (!res.ok) {
    const errorData = await res.json();
    const error: any = new Error("Login failed");
    error.response = { data: errorData };
    throw error;
  }
  return res.json();
};

export const register = async (
  data: RegisterCredentials
): Promise<AuthResponse> => {
  const res = await httpClient.post(`${API_BASE}/email/register`, data);
  if (!res.ok) {
    const errorData = await res.json();
    const error: any = new Error("Registration failed");
    error.response = { data: errorData };
    throw error;
  }
  return res.json();
};

export const getOAuthUrl = async (provider: string): Promise<string> => {
  const data = await requestJson<any>(
    httpClient.get(`${API_BASE}/${provider}/login`),
    "Failed to get OAuth URL"
  );
  return data.data.authorization_url;
};

export const oauthCallback = async (data: {
  code: string;
  redirect_uri: string;
  conflict_token?: string;
}): Promise<AuthResponse> => {
  const res = await httpClient.post(`${API_BASE}/nycu/callback`, data);
  if (!res.ok) {
    const errorData = await res.json().catch(() => null);
    const error: any = new Error("OAuth callback failed");
    error.response = { data: errorData, status: res.status };
    throw error;
  }
  return res.json();
};

export const resolveConflict = async (data: {
  conflict_token: string;
  action?: "takeover_lock";
}): Promise<AuthResponse> => {
  const res = await httpClient.post(`${API_BASE}/resolve-conflict`, {
    action: data.action || "takeover_lock",
    conflict_token: data.conflict_token,
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => null);
    const error: any = new Error("Resolve conflict failed");
    error.response = { data: errorData, status: res.status };
    throw error;
  }
  return res.json();
};

export const logout = async (): Promise<void> => {
  try {
    await ensureOk(httpClient.post(`${API_BASE}/logout`), "Failed to logout");
  } finally {
    clearAuthStorage();
  }
};

// ============================================================================
// User Management (Admin)
// ============================================================================

export const searchUsers = async (query: string): Promise<any> => {
  const res = await httpClient.get(
    `/api/v1/auth/search?q=${encodeURIComponent(query)}`
  );
  if (!res.ok) {
    const errorData = await res.json();
    const error: any = new Error("Search failed");
    error.response = { data: errorData };
    throw error;
  }
  return res.json();
};

export const updateUserRole = async (
  userId: number,
  role: string
): Promise<any> => {
  const res = await httpClient.patch(`/api/v1/auth/${userId}/role`, { role });
  if (!res.ok) {
    const errorData = await res.json();
    const error: any = new Error("Update failed");
    error.response = { data: errorData };
    throw error;
  }
  return res.json();
};

export const deleteUser = async (userId: number): Promise<void> => {
  await ensureOk(
    httpClient.delete(`/api/v1/auth/${userId}/`),
    "Failed to delete user"
  );
};

// ============================================================================
// User Stats & Preferences
// ============================================================================

export const getUserStats = async (): Promise<any> => {
  const data = await requestJson<any>(
    httpClient.get(`${API_BASE}/me/stats`),
    "Failed to fetch user stats"
  );
  return data.data;
};

export const getUserPreferences = async (): Promise<PreferencesResponse> => {
  return requestJson<PreferencesResponse>(
    httpClient.get(`${API_BASE}/me/preferences`),
    "Failed to fetch preferences"
  );
};

export const updateUserPreferences = async (
  data: UpdatePreferencesRequest
): Promise<PreferencesResponse> => {
  return requestJson<PreferencesResponse>(
    httpClient.patch(`${API_BASE}/me/preferences`, data),
    "Failed to update preferences"
  );
};

export const changePassword = async (
  data: ChangePasswordRequest
): Promise<ChangePasswordResponse> => {
  return requestJson<ChangePasswordResponse>(
    httpClient.post(`${API_BASE}/change-password`, data),
    "Failed to change password"
  );
};

export const updateCurrentUserProfile = async (
  data: UpdateAccountProfileRequest
): Promise<CurrentUserResponse> => {
  return requestJson<CurrentUserResponse>(
    httpClient.patch(`${API_BASE}/me`, data),
    "Failed to update profile"
  );
};

export const requestPasswordReset = async (
  data: ForgotPasswordRequest
): Promise<{ success: boolean; message?: string }> => {
  return requestJson<{ success: boolean; message?: string }>(
    httpClient.post(`${API_BASE}/forgot-password`, data),
    "Failed to request password reset"
  );
};

export const resetPassword = async (
  data: ResetPasswordRequest
): Promise<{ success: boolean; message?: string }> => {
  return requestJson<{ success: boolean; message?: string }>(
    httpClient.post(`${API_BASE}/reset-password`, data),
    "Failed to reset password"
  );
};

// ============================================================================
// API Key Management
// ============================================================================

export const getAPIKeyInfo = async (): Promise<APIKeyResponse> => {
  return requestJson<APIKeyResponse>(
    httpClient.get("/api/v1/users/me/api-key"),
    "Failed to fetch API key info"
  );
};

export const setAPIKey = async (
  data: SetAPIKeyRequest
): Promise<APIKeyResponse> => {
  return requestJson<APIKeyResponse>(
    httpClient.post("/api/v1/users/me/api-key", data),
    "Failed to set API key"
  );
};

export const deleteAPIKey = async (): Promise<{ success: boolean }> => {
  return requestJson<{ success: boolean }>(
    httpClient.delete("/api/v1/users/me/api-key"),
    "Failed to delete API key"
  );
};

export const getUsageStats = async (params?: {
  start_date?: string;
  end_date?: string;
  granularity?: "total" | "day" | "week" | "month";
}): Promise<UsageStatsResponse> => {
  const query = new URLSearchParams(params as any).toString();
  return requestJson<UsageStatsResponse>(
    httpClient.get(`/api/v1/users/me/api-key/usage?${query}`),
    "Failed to fetch usage stats"
  );
};

// ============================================================================
// Default Export
// ============================================================================

export default {
  login,
  register,
  getOAuthUrl,
  oauthCallback,
  resolveConflict,
  logout,
  searchUsers,
  updateUserRole,
  deleteUser,
  getUserStats,
  getUserPreferences,
  updateUserPreferences,
  changePassword,
  updateCurrentUserProfile,
  requestPasswordReset,
  resetPassword,
  getAPIKeyInfo,
  setAPIKey,
  deleteAPIKey,
  getUsageStats,
};
