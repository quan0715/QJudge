import type { User, UserPreferences, ManagedUser, TeacherActivationInvite, TeacherActivationPreview, UserLoginRecord, APIKeyInfo, UsageStatsData } from "@/core/entities/auth.entity";

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

// Data shapes as returned by Django REST Framework (some wrapped, some not)
export interface AuthSuccessDto {
  access_token: string;
  user: User;
  refresh_token?: string;
}

export type AuthResponseDto = ApiResponse<AuthSuccessDto>;
export type CurrentUserResponseDto = User; // Directly returns User object
export type PreferencesResponseDto = ApiResponse<UserPreferences>;
export type UserSearchResponseDto = ManagedUser[]; // Directly returns array
export type TeacherActivationIssueResponseDto = TeacherActivationInvite;
export type TeacherActivationPreviewResponseDto = TeacherActivationPreview;
export type TeacherActivationConsumeResponseDto = ApiResponse<{
  user: User;
  invite: TeacherActivationInvite;
}>;
export type APIKeyResponseDto = APIKeyInfo; // Directly returns object
export type UsageStatsResponseDto = UsageStatsData;
export type LoginRecordsResponseDto = UserLoginRecord[];
export type UploadAvatarResponseDto = ApiResponse<{
  avatar_url: string;
  content_type: string;
  size: number;
  alt?: string;
}>;
