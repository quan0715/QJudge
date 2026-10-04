import { fetchEnvelope } from "@/infrastructure/api/envelope";
import { httpClient } from "@/infrastructure/api/http.client";
import type { UpdatePreferencesRequest } from "@/core/entities/auth.entity";
import type {
  CurrentUserResponseDto,
  PreferencesResponseDto,
  UploadAvatarResponseDto,
  UserSearchResponseDto,
} from "@/infrastructure/api/dto/auth.dto";

export const getCurrentUser = async (): Promise<CurrentUserResponseDto> => {
  return fetchEnvelope<CurrentUserResponseDto["data"]>(
    httpClient.get("/api/v1/users/me", {
      allowUnauthenticated: true,
      suppressGlobalError: true,
    }),
    "Failed to fetch current user",
  );
};

export const updateAccountProfile = async (
  data: { username?: string; email?: string },
): Promise<CurrentUserResponseDto> => {
  return fetchEnvelope<CurrentUserResponseDto["data"]>(
    httpClient.patch("/api/v1/users/me", data),
    "Failed to update profile",
  );
};

export const getPreferences = async (): Promise<PreferencesResponseDto> => {
  return fetchEnvelope<PreferencesResponseDto["data"]>(
    httpClient.get("/api/v1/users/me/preferences"),
    "Failed to fetch preferences",
  );
};

export const updatePreferences = async (
  data: UpdatePreferencesRequest,
): Promise<PreferencesResponseDto> => {
  return fetchEnvelope<PreferencesResponseDto["data"]>(
    httpClient.patch("/api/v1/users/me/preferences", data),
    "Failed to update preferences",
  );
};

export const uploadAvatar = async (file: File): Promise<UploadAvatarResponseDto> => {
  const formData = new FormData();
  formData.append("file", file);

  return fetchEnvelope<UploadAvatarResponseDto["data"]>(
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

  return fetchEnvelope<UserSearchResponseDto["data"]>(
    httpClient.get(
      searchParams.size > 0
        ? `/api/v1/users/?${searchParams.toString()}`
        : "/api/v1/users/",
    ),
    "Failed to search users",
  );
};

export const updateUserRole = async (id: number | string, role: string): Promise<CurrentUserResponseDto> => {
  return fetchEnvelope<CurrentUserResponseDto["data"]>(
    httpClient.patch(`/api/v1/users/${id}/role`, { role }),
    "Failed to update user role",
  );
};
