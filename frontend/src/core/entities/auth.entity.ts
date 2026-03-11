export type ThemePreference = "light" | "dark" | "system";

export interface UserPreferences {
  display_name?: string;
  preferred_language: string;
  preferred_theme: ThemePreference;
  editor_font_size: number;
  editor_tab_size: 2 | 4;
}

export interface UserProfile extends UserPreferences {
  solved_count: number;
  submission_count: number;
  accept_rate: number;
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
}

export interface AuthSuccessData {
  access_token: string;
  user: User;
  refresh_token?: string;
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
  preferred_language?: string;
  preferred_theme?: ThemePreference;
  editor_font_size?: number;
  editor_tab_size?: 2 | 4;
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
