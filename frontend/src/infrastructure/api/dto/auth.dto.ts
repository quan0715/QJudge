import type { User, UserPreferences, ManagedUser, TeacherActivationInvite, TeacherActivationPreview, UserLoginRecord, APIKeyInfo, UsageStatsData } from "@/core/entities/auth.entity";

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface AuthSuccessDto {
  access_token: string;
  user: User;
  refresh_token?: string;
}

export type AuthResponseDto = ApiResponse<AuthSuccessDto>;
export type CurrentUserResponseDto = ApiResponse<User>;
export type PreferencesResponseDto = ApiResponse<UserPreferences>;
export type UserSearchResponseDto = ApiResponse<ManagedUser[]>;
export type TeacherActivationIssueResponseDto = ApiResponse<TeacherActivationInvite>;
export type TeacherActivationPreviewResponseDto = ApiResponse<TeacherActivationPreview>;
export type TeacherActivationConsumeResponseDto = ApiResponse<{
  user: User;
  invite: TeacherActivationInvite;
}>;
export type APIKeyResponseDto = ApiResponse<APIKeyInfo>;
export type UsageStatsResponseDto = ApiResponse<UsageStatsData>;
export type LoginRecordsResponseDto = ApiResponse<UserLoginRecord[]>;
export type UploadAvatarResponseDto = ApiResponse<{
  avatar_url: string;
  content_type: string;
  size: number;
  alt?: string;
}>;
