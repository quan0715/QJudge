import { httpClient, requestJson } from "@/infrastructure/api/http.client";
import type { UpdatePreferencesRequest } from "@/core/entities/auth.entity";
import type {
  CurrentUserResponseDto,
  PreferencesResponseDto,
  UploadAvatarResponseDto,
  UserSearchResponseDto,
} from "@/infrastructure/api/dto/auth.dto";

export const getCurrentUser = async (): Promise<CurrentUserResponseDto> => {
  return requestJson<CurrentUserResponseDto>(
    httpClient.get("/api/v1/users/me"),
    "Failed to fetch user data",
  );
};

export const updateAccountProfile = async (
  data: { username?: string; email?: string },
): Promise<CurrentUserResponseDto> => {
  return requestJson<CurrentUserResponseDto>(
    httpClient.patch("/api/v1/users/me", data),
    "Failed to update profile",
  );
};

export const getPreferences = async (): Promise<PreferencesResponseDto> => {
  return requestJson<PreferencesResponseDto>(
    httpClient.get("/api/v1/users/me/preferences"),
    "Failed to fetch preferences",
  );
};

export const updatePreferences = async (
  data: UpdatePreferencesRequest,
): Promise<PreferencesResponseDto> => {
  return requestJson<PreferencesResponseDto>(
    httpClient.patch("/api/v1/users/me/preferences", data),
    "Failed to update preferences",
  );
};

export const uploadAvatar = async (file: File): Promise<UploadAvatarResponseDto> => {
  const formData = new FormData();
  formData.append("file", file);

  return requestJson<UploadAvatarResponseDto>(
    httpClient.request("/api/v1/users/me/avatar", {
      method: "POST",
      body: formData,
    }),
    "Failed to upload avatar",
  );
};

export const searchUsers = async (query: string): Promise<UserSearchResponseDto> => {
  const trimmedQuery = query.trim();
  const searchParams = new URLSearchParams();
  if (trimmedQuery) {
    searchParams.set("q", trimmedQuery);
  }

  return requestJson<UserSearchResponseDto>(
    httpClient.get(
      searchParams.size > 0
        ? `/api/v1/users/?${searchParams.toString()}`
        : "/api/v1/users/",
    ),
    "Failed to search users",
  );
};

export const updateUserRole = async (id: number | string, role: string): Promise<any> => {
  return requestJson<any>(
    httpClient.patch(`/api/v1/users/${id}/role`, { role }),
    "Failed to update user role",
  );
};

export const userRepository = {
  getCurrentUser,
  updateAccountProfile,
  getPreferences,
  updatePreferences,
  uploadAvatar,
  searchUsers,
  updateUserRole,
};

export default userRepository;
