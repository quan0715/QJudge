export type ThemePreference = "light" | "dark" | "system";

export interface UserPreferences {
  preferred_language: string;
  preferred_theme: ThemePreference;
  editor_font_size: number;
  editor_tab_size: 2 | 4;
}

export interface UserProfile {
  display_name: string;
  avatar_url: string | null;
}

export interface UserSettings {
  profile: UserProfile;
  preferences: UserPreferences;
  onboarding_completed_at: string | null;
}

export type ManagedUser = User;

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
  onboarding_completed_at?: string | null;
  profile?: UserProfile;
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
  password_reset_enabled?: boolean;
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
  meta: Record<string, unknown>;
  data: AuthSuccessData;
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
  profile?: Partial<UserProfile>;
  preferences?: Partial<UserPreferences>;
  onboarding_completed_at?: string | null;
}

export interface PreferencesResponse {
  meta: Record<string, unknown>;
  data: UserSettings;
}

export interface CurrentUserResponse {
  meta: Record<string, unknown>;
  data: User;
}

export interface UserSearchResponse {
  meta: Record<string, unknown>;
  data: ManagedUser[];
}

export interface ActionLinkIssueResponse {
  meta: Record<string, unknown>;
  data: ActionLinkIssueData;
}

export interface ActionLinkInspectResponse {
  meta: Record<string, unknown>;
  data: ActionLinkPreview;
}

export interface ActionLinkRedeemResponse {
  meta: Record<string, unknown>;
  data: AuthSuccessData & {
    invite?: ActionLinkIssueData;
    action_link?: ActionLinkPreview;
  };
}

export interface UploadAvatarResponse {
  meta: Record<string, unknown>;
  data: {
    avatar_url: string;
    content_type: string;
    size: number;
    alt?: string;
  };
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
