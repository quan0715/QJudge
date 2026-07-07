import type {
  AuthOptions,
  User,
  UserPreferences,
  ManagedUser,
  ActionLinkIssueData,
  ActionLinkPreview,
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
export type ActionLinkIssueResponseDto = ApiResponse<ActionLinkIssueData>;
export type ActionLinkInspectResponseDto = ApiResponse<ActionLinkPreview>;
export type ActionLinkRedeemResponseDto =
  | ApiResponse<{
      access_token: string;
      user: User;
      refresh_token?: string;
      invite?: ActionLinkIssueData;
      action_link?: ActionLinkPreview;
    }>
  | ClassroomDetailDto;
export type LoginRecordsResponseDto = ApiResponse<UserLoginRecord[]>;
export type UploadAvatarResponseDto = ApiResponse<{
  avatar_url: string;
  content_type: string;
  size: number;
  alt?: string;
}>;
