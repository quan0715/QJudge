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
  IAuthRepository,
  UpdateAccountProfilePayload,
} from "@/core/ports/auth.repository";
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
} from "../api/dto/auth.dto";

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

export const updateAccountProfile = async (
  data: UpdateAccountProfilePayload
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

export const requestPasswordReset = async (
  data: { email: string },
): Promise<void> => {
  await ensureOk(
    httpClient.post("/api/v1/auth/password/reset/", data),
    "Failed to request password reset",
  );
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

// ============================================================================
// Teacher Activation
// ============================================================================

export const issueTeacherInvite = async (
  email: string
): Promise<TeacherActivationInvite> => {
  const response = await requestJson<TeacherActivationIssueResponseDto>(
    httpClient.post("/api/v1/management/teacher-invites/", { email }),
    "Failed to issue invite"
  );
  return response.data;
};

export const previewTeacherActivation = async (
  token: string
): Promise<TeacherActivationPreview> => {
  const response = await requestJson<TeacherActivationPreviewResponseDto>(
    httpClient.get(`/api/v1/auth/teacher-activation/preview/?token=${encodeURIComponent(token)}`),
    "Failed to preview activation"
  );
  return response.data;
};

export const consumeTeacherActivation = async (
  token: string
): Promise<{ user: User; invite: TeacherActivationInvite }> => {
  const response = await requestJson<TeacherActivationConsumeResponseDto>(
    httpClient.post("/api/v1/auth/teacher-activation/consume/", { token }),
    "Failed to activate teacher account"
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

export const getUsageData = async (params: {
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

export const authRepository: IAuthRepository = {
  login,
  register,
  getCurrentUser,
  logout,
  changePassword,
  updateAccountProfile,
  getPreferences,
  updatePreferences,
  uploadAvatar,
  searchUsers,
  issueTeacherInvite,
  previewTeacherActivation,
  consumeTeacherActivation,
  getLoginRecords,
  getAPIKeyInfo,
  setAPIKey,
  deleteAPIKey,
  getUsageData,
};

export default authRepository;
