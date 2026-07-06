import type {
  AuthOptions,
  User,
  UserPreferences,
  ManagedUser,
  MagicLinkIssueData,
  MagicLinkPreview,
  UserLoginRecord,
} from "@/core/entities/auth.entity";
import type { ClassroomDetailDto } from "./classroom.dto";

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
    participant_id?: number;
    exam_status?: string;
    started_at?: string | null;
    bound_classroom_id?: string | null;
    resume_path?: string | null;
  };
}

export type AuthResponseDto = ApiResponse<AuthSuccessDto>;
export type AuthOptionsResponseDto = ApiResponse<AuthOptions>;
export type CurrentUserResponseDto = ApiResponse<User>;
export type PreferencesResponseDto = ApiResponse<UserPreferences>;
export type UserSearchResponseDto = ApiResponse<ManagedUser[]>;
export type MagicLinkIssueResponseDto = ApiResponse<MagicLinkIssueData>;
export type MagicLinkInspectResponseDto = ApiResponse<MagicLinkPreview>;
export type MagicLinkRedeemResponseDto =
  | ApiResponse<{
      access_token: string;
      user: User;
      refresh_token?: string;
      invite?: MagicLinkIssueData;
      magic_link?: MagicLinkPreview;
    }>
  | ClassroomDetailDto;
export type LoginRecordsResponseDto = ApiResponse<UserLoginRecord[]>;
export type UploadAvatarResponseDto = ApiResponse<{
  avatar_url: string;
  content_type: string;
  size: number;
  alt?: string;
}>;
