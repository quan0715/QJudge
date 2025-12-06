export type UserRole = 'student' | 'teacher' | 'admin';

export interface User {
  id: string | number; // ID can be string or number depending on backend, unifying to allow both for now or check usage. Most likely number based on previous views.
  username: string;
  email: string;
  role?: UserRole;
  avatar_url?: string;
  display_name?: string;
}

export interface AuthToken {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
}
