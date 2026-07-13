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
  last_login_at?: string | null;
  is_active?: boolean;
  display_name?: string;
  onboarding_completed_at?: string | null;
}

export type ActionLinkPurpose = "teacher_activation" | "classroom_join";
export type ActionLinkStatus = "pending" | "consumed" | "expired" | "revoked";

export interface ActionLinkTarget {
  type: "classroom";
  id: string;
  name: string;
}

export interface ActionLinkPreview {
  id?: number;
  purpose: ActionLinkPurpose;
  status: ActionLinkStatus;
  requires_login: boolean;
  current_user_email?: string | null;
  current_user_role?: string | null;
  can_redeem: boolean;
  can_consume?: boolean;
  expires_at?: string;
  consumed_at?: string | null;
  created_at?: string;
  target?: ActionLinkTarget;
}

export interface ActionLinkIssueData {
  id?: number;
  purpose: ActionLinkPurpose;
  email?: string;
  expires_at?: string;
  consumed_at?: string | null;
  created_at?: string;
  status?: ActionLinkStatus;
  action_link_url?: string;
  activation_url?: string;
  token?: string;
  target?: ActionLinkTarget;
  existing_user?: {
    id: number;
    username: string;
    role: "student" | "teacher" | "admin";
  } | null;
}

export interface User {
  id: number;
  username: string;
  email?: string;
  role: "student" | "teacher" | "admin" | "guest";
  auth_provider?: string;
  last_login_at?: string | null;
  is_active?: boolean;
  profile?: UserProfile;
  subscription?: UserSubscription;
}

export interface AuthProviderOption {
  key: string;
  type?: "credentials" | "oauth2" | "oidc";
  category: "campus" | "social" | "password";
  display_name: string;
  display_name_i18n_key?: string;
  logo_url?: string;
}

export interface AuthOptions {
  password_enabled: boolean;
  providers: AuthProviderOption[];
}

export interface AuthSuccessData {
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

export interface AuthResponse {
  success: boolean;
  data: AuthSuccessData;
  message?: string;
}

export interface LoginCredentials {
  identifier?: string;
  username?: string;
  password?: string;
}

export interface RegisterCredentials {
  username: string;
  email: string;
  password?: string;
  password_confirm?: string;
}

export interface UpdateAccountProfileRequest {
  username?: string;
  email?: string;
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

export interface ActionLinkIssueResponse {
  success: boolean;
  data: ActionLinkIssueData;
  message?: string;
}

export interface ActionLinkInspectResponse {
  success: boolean;
  data: ActionLinkPreview;
  message?: string;
}

export interface ActionLinkRedeemResponse {
  success: boolean;
  data: AuthSuccessData & {
    invite?: ActionLinkIssueData;
    action_link?: ActionLinkPreview;
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
