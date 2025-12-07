export interface User {
  id: number;
  username: string;
  email?: string;
  role: 'student' | 'teacher' | 'admin' | 'guest';
  auth_provider?: string;
  email_verified?: boolean;
  last_login_at?: string | null;
  is_active?: boolean;
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
