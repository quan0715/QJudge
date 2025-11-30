export interface AuthResponse {
  success: boolean;
  data: {
    access_token: string;
    refresh_token: string;
    user: {
      username: string;
      email: string;
      role?: string;
    };
  };
}

export interface User {
  username: string;
  email: string;
  role?: string;
}
