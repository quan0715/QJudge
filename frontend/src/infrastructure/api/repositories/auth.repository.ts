/**
 * Auth Repository Implementation
 *
 * Handles login, registration, password changes, and preferences.
 */

import { httpClient, requestJson, ensureOk } from "@/infrastructure/api/http.client";
import type {
  LoginCredentials,
  RegisterCredentials,
  ChangePasswordRequest,
  UpdatePreferencesRequest,
} from "@/core/entities/auth.entity";
import type {
  AuthResponseDto,
  AuthOptionsResponseDto,
  CurrentUserResponseDto,
  PreferencesResponseDto,
  UserSearchResponseDto,
  TeacherActivationIssueResponseDto,
  TeacherActivationPreviewResponseDto,
  TeacherActivationConsumeResponseDto,
  LoginRecordsResponseDto,
  UploadAvatarResponseDto,
} from "@/infrastructure/api/dto/auth.dto";

// ============================================================================
// Auth Repository Implementation
// ============================================================================

export const login = async (
  credentials: LoginCredentials
): Promise<AuthResponseDto> => {
  return requestJson<AuthResponseDto>(
    httpClient.post("/api/v1/auth/email/login", credentials),
    "Login failed"
  );
};

export const register = async (
  credentials: RegisterCredentials
): Promise<AuthResponseDto> => {
  return requestJson<AuthResponseDto>(
    httpClient.post("/api/v1/auth/email/register", credentials),
    "Registration failed"
  );
};

export const getAuthOptions = async (): Promise<AuthOptionsResponseDto> => {
  return requestJson<AuthOptionsResponseDto>(
    httpClient.get("/api/v1/auth/options"),
    "Failed to fetch auth options"
  );
};

export const getCurrentUser = async (): Promise<CurrentUserResponseDto> => {
  return requestJson<CurrentUserResponseDto>(
    httpClient.get("/api/v1/auth/me"),
    "Failed to fetch user data"
  );
};

export const logout = async (): Promise<void> => {
  await ensureOk(httpClient.post("/api/v1/auth/logout"), "Logout failed");
};

export const changePassword = async (
  data: ChangePasswordRequest
): Promise<void> => {
  await requestJson<{ success: boolean; message?: string }>(
    httpClient.post("/api/v1/auth/change-password", data),
    "Failed to change password"
  );
};

export const requestPasswordReset = async (email: string): Promise<void> => {
  await ensureOk(
    httpClient.post("/api/v1/auth/forgot-password", { email }),
    "Failed to request password reset"
  );
};

export const updateAccountProfile = async (
  data: { username?: string; email?: string }
): Promise<CurrentUserResponseDto> => {
  return requestJson<CurrentUserResponseDto>(
    httpClient.patch("/api/v1/auth/me", data),
    "Failed to update profile"
  );
};

// ============================================================================
// Preferences
// ============================================================================

export const getPreferences = async (): Promise<PreferencesResponseDto> => {
  return requestJson<PreferencesResponseDto>(
    httpClient.get("/api/v1/auth/me/preferences"),
    "Failed to fetch preferences"
  );
};

export const updatePreferences = async (
  data: UpdatePreferencesRequest
): Promise<PreferencesResponseDto> => {
  return requestJson<PreferencesResponseDto>(
    httpClient.patch("/api/v1/auth/me/preferences", data),
    "Failed to update preferences"
  );
};

export const uploadAvatar = async (file: File): Promise<UploadAvatarResponseDto> => {
  const formData = new FormData();
  formData.append("file", file);

  return requestJson<UploadAvatarResponseDto>(
    httpClient.request("/api/v1/auth/me/avatar/upload", {
      method: "POST",
      body: formData,
    }),
    "Failed to upload avatar"
  );
};

// ============================================================================
// Admin - User Management
// ============================================================================

export const searchUsers = async (query: string): Promise<UserSearchResponseDto> => {
  const trimmedQuery = query.trim();
  const searchParams = new URLSearchParams();
  if (trimmedQuery) {
    searchParams.set("q", trimmedQuery);
  }

  return requestJson<UserSearchResponseDto>(
    httpClient.get(
      searchParams.size > 0
        ? `/api/v1/auth/search?${searchParams.toString()}`
        : "/api/v1/auth/search"
    ),
    "Failed to search users"
  );
};

export const updateUserRole = async (id: number | string, role: string): Promise<any> => {
  return requestJson<any>(
    httpClient.patch(`/api/v1/auth/${id}/role`, { role }),
    "Failed to update user role"
  );
};

export const logoutOtherDevices = async (): Promise<void> => {
  await ensureOk(httpClient.post("/api/v1/auth/me/logout-other-devices"), "Failed to logout other devices");
};

// ============================================================================
// Teacher Activation
// ============================================================================

export const issueTeacherActivationInvite = async (
  email: string
): Promise<TeacherActivationIssueResponseDto> => {
  return requestJson<TeacherActivationIssueResponseDto>(
    httpClient.post("/api/v1/auth/teacher-activations", { email }),
    "Failed to issue invite"
  );
};

// Alias used in some components
export const issueTeacherInvite = issueTeacherActivationInvite;

export const previewTeacherActivationInvite = async (
  token: string
): Promise<TeacherActivationPreviewResponseDto> => {
  return requestJson<TeacherActivationPreviewResponseDto>(
    httpClient.get(`/api/v1/auth/teacher-activations/preview?token=${encodeURIComponent(token)}`),
    "Failed to preview activation"
  );
};

export const consumeTeacherActivationInvite = async (
  token: string
): Promise<TeacherActivationConsumeResponseDto> => {
  return requestJson<TeacherActivationConsumeResponseDto>(
    httpClient.post("/api/v1/auth/teacher-activations/consume", { token }),
    "Failed to activate teacher account"
  );
};

// ============================================================================
// OAuth
// ============================================================================

export const getOAuthUrl = async (provider: string, redirect?: string): Promise<string> => {
  const query = redirect ? `?redirect=${encodeURIComponent(redirect)}` : "";
  const response = await requestJson<{ success: boolean; data?: { authorization_url?: string } }>(
    httpClient.get(`/api/v1/auth/${provider}/login${query}`),
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
    httpClient.post(`/api/v1/auth/${provider}/callback`, { code, redirect_uri: redirectUri }),
    "OAuth callback failed"
  );
};

export const resolveLoginConflict = async (conflictToken: string): Promise<AuthResponseDto> => {
  return requestJson<AuthResponseDto>(
    httpClient.post("/api/v1/auth/resolve-conflict", {
      conflict_token: conflictToken,
      action: "takeover_recovery",
    }),
    "Failed to resolve login conflict"
  );
};

// ============================================================================
// Login Records
// ============================================================================

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
  getCurrentUser,
  logout,
  changePassword,
  requestPasswordReset,
  updateAccountProfile,
  getPreferences,
  updatePreferences,
  uploadAvatar,
  searchUsers,
  updateUserRole,
  logoutOtherDevices,
  issueTeacherActivationInvite,
  issueTeacherInvite,
  previewTeacherActivationInvite,
  consumeTeacherActivationInvite,
  getOAuthUrl,
  oauthCallback,
  getLoginRecords,
};

export default authRepository;
