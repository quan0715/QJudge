import type { User, UserPreferences, ManagedUser, TeacherActivationInvite, TeacherActivationPreview, UserLoginRecord } from "@/core/entities/auth.entity";

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface AuthSuccessDto {
  access_token: string;
  user: User;
  refresh_token?: string;
  resume_required?: boolean;
  active_exam?: {
    contest_id: string;
    contest_name: string;
    exam_status?: string;
    started_at?: string | null;
    bound_classroom_id?: string | null;
    resume_path?: string | null;
  };
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
export type LoginRecordsResponseDto = ApiResponse<UserLoginRecord[]>;
export type UploadAvatarResponseDto = ApiResponse<{
  avatar_url: string;
  content_type: string;
  size: number;
  alt?: string;
}>;
