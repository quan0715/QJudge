import { httpClient } from "@/services/api/httpClient";
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
  const res = await httpClient.get(`${API_BASE}/${provider}/login`);
  if (!res.ok) throw new Error("Failed to get OAuth URL");
  const data = await res.json();
  return data.data.authorization_url;
};

export const oauthCallback = async (data: {
  code: string;
  redirect_uri: string;
}): Promise<AuthResponse> => {
  const res = await httpClient.post(`${API_BASE}/nycu/callback`, data);
  if (!res.ok) throw new Error("OAuth callback failed");
  return res.json();
};

// User management (admin only)
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

export const getUserStats = async (): Promise<any> => {
  const res = await httpClient.get(`${API_BASE}/me/stats`);
  if (!res.ok) throw new Error("Failed to fetch user stats");
  const data = await res.json();
  return data.data;
};

export const deleteUser = async (userId: number): Promise<void> => {
  const res = await httpClient.delete(`/api/v1/auth/${userId}/`);
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.detail || "Failed to delete user");
  }
};

// User preferences
export const getUserPreferences = async (): Promise<PreferencesResponse> => {
  const res = await httpClient.get(`${API_BASE}/me/preferences`);
  if (!res.ok) {
    const errorData = await res.json();
    const error: any = new Error("Failed to fetch preferences");
    error.response = { data: errorData };
    throw error;
  }
  return res.json();
};

export const updateUserPreferences = async (
  data: UpdatePreferencesRequest
): Promise<PreferencesResponse> => {
  const res = await httpClient.patch(`${API_BASE}/me/preferences`, data);
  if (!res.ok) {
    const errorData = await res.json();
    const error: any = new Error("Failed to update preferences");
    error.response = { data: errorData };
    throw error;
  }
  return res.json();
};

export const changePassword = async (
  data: ChangePasswordRequest
): Promise<ChangePasswordResponse> => {
  const res = await httpClient.post(`${API_BASE}/change-password`, data);
  if (!res.ok) {
    const errorData = await res.json();
    const error: any = new Error("Failed to change password");
    error.response = { data: errorData };
    throw error;
  }
  return res.json();
};

export default {
  login,
  register,
  getOAuthUrl,
  oauthCallback,
  searchUsers,
  updateUserRole,
  deleteUser,
  getUserStats,
  getUserPreferences,
  updateUserPreferences,
  changePassword,
};
