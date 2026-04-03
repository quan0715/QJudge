/**
 * Auth Repository Implementation
 *
 * Handles login, registration, password changes, and preferences.
 */

import { httpClient, requestJson, ensureOk } from "@/infrastructure/api/http.client";
import type {
  User,
  UserPreferences,
  AuthSuccessData,
  LoginCredentials,
  RegisterCredentials,
  ChangePasswordRequest,
  ManagedUser,
  TeacherActivationInvite,
  TeacherActivationPreview,
  UpdatePreferencesRequest,
  UserLoginRecord,
  APIKeyInfo,
  SetAPIKeyRequest,
  UsageStatsData,
} from "@/core/entities/auth.entity";
import type {
  AuthResponseDto,
  CurrentUserResponseDto,
  PreferencesResponseDto,
  UserSearchResponseDto,
  TeacherActivationIssueResponseDto,
  TeacherActivationPreviewResponseDto,
  TeacherActivationConsumeResponseDto,
  APIKeyResponseDto,
  UsageStatsResponseDto,
  LoginRecordsResponseDto,
  UploadAvatarResponseDto,
} from "@/infrastructure/api/dto/auth.dto";

// ============================================================================
// Auth Repository Implementation
// ============================================================================

export const login = async (
  credentials: LoginCredentials
): Promise<AuthSuccessData> => {
  const response = await requestJson<AuthResponseDto>(
    httpClient.post("/api/v1/auth/login/", credentials),
    "Login failed"
  );
  return response.data;
};

export const register = async (
  credentials: RegisterCredentials
): Promise<AuthSuccessData> => {
  const response = await requestJson<AuthResponseDto>(
    httpClient.post("/api/v1/auth/register/", credentials),
    "Registration failed"
  );
  return response.data;
};

export const getCurrentUser = async (): Promise<User> => {
  const response = await requestJson<CurrentUserResponseDto>(
    httpClient.get("/api/v1/auth/me/"),
    "Failed to fetch user data"
  );
  return response.data;
};

export const logout = async (): Promise<void> => {
  await ensureOk(httpClient.post("/api/v1/auth/logout/"), "Logout failed");
};

export const changePassword = async (
  data: ChangePasswordRequest
): Promise<void> => {
  await requestJson<{ success: boolean; message?: string }>(
    httpClient.post("/api/v1/auth/password/change/", data),
    "Failed to change password"
  );
};

export const requestPasswordReset = async (email: string): Promise<void> => {
  await ensureOk(
    httpClient.post("/api/v1/auth/password/reset/", { email }),
    "Failed to request password reset"
  );
};

export const updateAccountProfile = async (
  data: { username?: string; email?: string }
): Promise<User> => {
  const response = await requestJson<CurrentUserResponseDto>(
    httpClient.patch("/api/v1/auth/account/", data),
    "Failed to update profile"
  );
  return response.data;
};

// ============================================================================
// Preferences
// ============================================================================

export const getPreferences = async (): Promise<UserPreferences> => {
  const response = await requestJson<PreferencesResponseDto>(
    httpClient.get("/api/v1/auth/preferences/"),
    "Failed to fetch preferences"
  );
  return response.data;
};

export const updatePreferences = async (
  data: UpdatePreferencesRequest
): Promise<UserPreferences> => {
  const response = await requestJson<PreferencesResponseDto>(
    httpClient.patch("/api/v1/auth/preferences/", data),
    "Failed to update preferences"
  );
  return response.data;
};

export const uploadAvatar = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await requestJson<UploadAvatarResponseDto>(
    httpClient.post("/api/v1/auth/avatar/", formData),
    "Failed to upload avatar"
  );
  return response.data.avatar_url;
};

// ============================================================================
// Admin - User Management
// ============================================================================

export const searchUsers = async (query: string): Promise<ManagedUser[]> => {
  const response = await requestJson<UserSearchResponseDto>(
    httpClient.get(`/api/v1/management/users/?search=${encodeURIComponent(query)}`),
    "Failed to search users"
  );
  return response.data;
};

export const deleteUser = async (id: number | string): Promise<void> => {
  await ensureOk(httpClient.delete(`/api/v1/management/users/${id}/`), "Failed to delete user");
};

export const updateUserRole = async (id: number | string, role: string): Promise<any> => {
  return requestJson<any>(
    httpClient.patch(`/api/v1/management/users/${id}/`, { role }),
    "Failed to update user role"
  );
};

export const logoutOtherDevices = async (): Promise<void> => {
  await ensureOk(httpClient.post("/api/v1/auth/logout-others/"), "Failed to logout other devices");
};

// ============================================================================
// Teacher Activation
// ============================================================================

export const issueTeacherActivationInvite = async (
  email: string
): Promise<TeacherActivationInvite> => {
  const response = await requestJson<TeacherActivationIssueResponseDto>(
    httpClient.post("/api/v1/management/teacher-invites/", { email }),
    "Failed to issue invite"
  );
  return response.data;
};

export const previewTeacherActivationInvite = async (
  token: string
): Promise<TeacherActivationPreview> => {
  const response = await requestJson<TeacherActivationPreviewResponseDto>(
    httpClient.get(`/api/v1/auth/teacher-activation/preview/?token=${encodeURIComponent(token)}`),
    "Failed to preview activation"
  );
  return response.data;
};

export const consumeTeacherActivationInvite = async (
  token: string
): Promise<{ user: User; invite: TeacherActivationInvite }> => {
  const response = await requestJson<TeacherActivationConsumeResponseDto>(
    httpClient.post("/api/v1/auth/teacher-activation/consume/", { token }),
    "Failed to activate teacher account"
  );
  return response.data;
};

// ============================================================================
// OAuth
// ============================================================================

export const getOAuthUrl = async (provider: string, redirect?: string): Promise<string> => {
  const query = redirect ? `?redirect=${encodeURIComponent(redirect)}` : "";
  const response = await requestJson<ApiResponse<{ url: string }>>(
    httpClient.get(`/api/v1/auth/oauth/${provider}/url/${query}`),
    "Failed to get OAuth URL"
  );
  return response.data.url;
};

export const oauthCallback = async (provider: string, code: string): Promise<AuthSuccessData> => {
  const response = await requestJson<AuthResponseDto>(
    httpClient.post(`/api/v1/auth/oauth/${provider}/callback/`, { code }),
    "OAuth callback failed"
  );
  return response.data;
};

// ============================================================================
// Login Records
// ============================================================================

export const getLoginRecords = async (): Promise<UserLoginRecord[]> => {
  const response = await requestJson<LoginRecordsResponseDto>(
    httpClient.get("/api/v1/auth/login-records/"),
    "Failed to fetch login records"
  );
  return response.data;
};

// ============================================================================
// API Key Management
// ============================================================================

export const getAPIKeyInfo = async (): Promise<APIKeyInfo> => {
  const response = await requestJson<APIKeyResponseDto>(
    httpClient.get("/api/v1/auth/api-key/"),
    "Failed to fetch API key info"
  );
  return response.data;
};

export const setAPIKey = async (data: SetAPIKeyRequest): Promise<APIKeyInfo> => {
  const response = await requestJson<APIKeyResponseDto>(
    httpClient.post("/api/v1/auth/api-key/", data),
    "Failed to set API key"
  );
  return response.data;
};

export const deleteAPIKey = async (): Promise<void> => {
  await ensureOk(httpClient.delete("/api/v1/auth/api-key/"), "Failed to delete API key");
};

export const getUsageStats = async (params: {
  start_date?: string;
  end_date?: string;
}): Promise<UsageStatsData> => {
  const query = new URLSearchParams(params).toString();
  const response = await requestJson<UsageStatsResponseDto>(
    httpClient.get(`/api/v1/auth/api-key/usage/?${query}`),
    "Failed to fetch usage data"
  );
  return response.data;
};

// ============================================================================
// Repository Instance
// ============================================================================

export const authRepository = {
  login,
  register,
  getCurrentUser,
  logout,
  changePassword,
  requestPasswordReset,
  updateAccountProfile,
  getPreferences,
  updatePreferences,
  uploadAvatar,
  searchUsers,
  deleteUser,
  updateUserRole,
  logoutOtherDevices,
  issueTeacherActivationInvite,
  previewTeacherActivationInvite,
  consumeTeacherActivationInvite,
  getOAuthUrl,
  oauthCallback,
  getLoginRecords,
  getAPIKeyInfo,
  setAPIKey,
  deleteAPIKey,
  getUsageStats,
};

export default authRepository;
