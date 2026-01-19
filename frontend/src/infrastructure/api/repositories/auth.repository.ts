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
}): Promise<AuthResponse> => {
  return requestJson<AuthResponse>(
    httpClient.post(`${API_BASE}/nycu/callback`, data),
    "OAuth callback failed"
  );
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

// ============================================================================
// Default Export
// ============================================================================

export default {
  login,
  register,
  getOAuthUrl,
  oauthCallback,
  logout,
  searchUsers,
  updateUserRole,
  deleteUser,
  getUserStats,
  getUserPreferences,
  updateUserPreferences,
  changePassword,
};
