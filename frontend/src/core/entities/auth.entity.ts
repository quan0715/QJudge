export type ThemePreference = "light" | "dark" | "system";

export interface UserPreferences {
  display_name?: string;
  avatar_url?: string;
  preferred_language: string;
  preferred_theme: ThemePreference;
  editor_font_size: number;
  editor_tab_size: 2 | 4;
  onboarding_completed_at?: string | null;
}

export interface UserProfile extends UserPreferences {
  solved_count: number;
  submission_count: number;
  accept_rate: number;
}

export interface UserSubscription {
  tier: "free" | "pro" | "team" | "enterprise";
  status: "active" | "trialing" | "past_due" | "cancelled" | "expired";
}

export interface ManagedUser {
  id: number;
  username: string;
  email?: string;
  role: "student" | "teacher" | "admin";
  auth_provider?: string;
  email_verified?: boolean;
  last_login_at?: string | null;
  is_active?: boolean;
  display_name?: string;
  onboarding_completed_at?: string | null;
}

export interface TeacherActivationInvite {
  id: number;
  email?: string;
  expires_at: string;
  consumed_at?: string | null;
  created_at: string;
  status: "pending" | "consumed" | "expired";
  activation_url?: string;
  existing_user?: {
    id: number;
    username: string;
    role: "student" | "teacher" | "admin";
  } | null;
}

export interface TeacherActivationPreview extends TeacherActivationInvite {
  requires_login: boolean;
  current_user_email?: string | null;
  current_user_role?: string | null;
  can_consume: boolean;
}

export interface User {
  id: number;
  username: string;
  email?: string;
  role: "student" | "teacher" | "admin" | "guest";
  auth_provider?: string;
  email_verified?: boolean;
  last_login_at?: string | null;
  is_active?: boolean;
  profile?: UserProfile;
  subscription?: UserSubscription;
}

export interface AuthSuccessData {
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

export interface AuthResponse {
  success: boolean;
  data: AuthSuccessData;
  message?: string;
}

export interface LoginCredentials {
  email?: string;
  username?: string;
  password?: string;
}

export interface RegisterCredentials {
  username: string;
  email: string;
  password?: string;
  password_confirm?: string;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
  new_password_confirm: string;
}

export interface UpdateAccountProfileRequest {
  username?: string;
  email?: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  new_password: string;
  new_password_confirm: string;
}

export interface UpdatePreferencesRequest {
  display_name?: string;
  avatar_url?: string;
  preferred_language?: string;
  preferred_theme?: ThemePreference;
  editor_font_size?: number;
  editor_tab_size?: 2 | 4;
  onboarding_completed_at?: string | null;
}

export interface PreferencesResponse {
  success: boolean;
  data: UserPreferences;
  message?: string;
}

export interface ChangePasswordResponse {
  success: boolean;
  message?: string;
}

export interface CurrentUserResponse {
  success: boolean;
  data: User;
  message?: string;
}

export interface UserSearchResponse {
  success: boolean;
  data: ManagedUser[];
  message?: string;
}

export interface TeacherActivationIssueResponse {
  success: boolean;
  data: TeacherActivationInvite;
  message?: string;
}

export interface TeacherActivationPreviewResponse {
  success: boolean;
  data: TeacherActivationPreview;
  message?: string;
}

export interface TeacherActivationConsumeResponse {
  success: boolean;
  data: {
    user: User;
    invite: TeacherActivationInvite;
  };
  message?: string;
}

export interface UploadAvatarResponse {
  success: boolean;
  data: {
    avatar_url: string;
    content_type: string;
    size: number;
    alt?: string;
  };
  message?: string;
}

// Login Records
export interface UserLoginRecord {
  id: number;
  device_id: string;
  ip_address: string;
  user_agent: string;
  login_method: string;
  created_at: string;
  is_current: boolean;
}

// API Key 相關
export interface APIKeyInfo {
  has_key: boolean;
  is_active?: boolean;
  is_validated?: boolean;
  key_name?: string;
  total_input_tokens?: number;
  total_output_tokens?: number;
  total_requests?: number;
  total_cost_usd?: number;
  last_validated_at?: string;
  created_at?: string;
}

export interface SetAPIKeyRequest {
  api_key: string;
  key_name?: string;
}

export interface APIKeyResponse {
  success: boolean;
  data?: APIKeyInfo;
  message?: string;
}

// Usage Statistics 相關
export interface UsageStatsItem {
  period: string; // ISO date
  input_tokens: number;
  output_tokens: number;
  requests: number;
  cost_usd: number;
}

export interface UsageStatsTotal {
  input_tokens: number;
  output_tokens: number;
  requests: number;
  cost_usd: number;
}

export interface UsageStatsData {
  total: UsageStatsTotal;
  breakdown: UsageStatsItem[];
}

export interface UsageStatsResponse {
  success: boolean;
  data: UsageStatsData;
  message?: string;
}
