/**
 * API Integration Test Setup
 *
 * 共用的測試配置、helpers 和工具函數
 *
 * 執行前需要：
 * 1. 啟動測試環境: docker compose -f docker-compose.test.yml up -d
 * 2. 執行測試: npm run test:api
 */

// API Base URL for test environment
// Use import.meta.env for Vite compatibility
export const API_BASE_URL =
  (import.meta.env?.VITE_API_BASE_URL as string) ||
  (import.meta.env?.API_BASE_URL as string) ||
  "http://localhost:8001";

// Test credentials - must match seed_e2e_data.py in backend
export const TEST_USERS = {
  student: {
    email: "student@example.com",
    password: "student123",
  },
  teacher: {
    email: "teacher@example.com",
    password: "teacher123",
  },
  admin: {
    email: "admin@example.com",
    password: "admin123",
  },
} as const;

export type UserRole = keyof typeof TEST_USERS;

/**
 * DTO type definitions for reference (snake_case from API)
 *
 * AuthResponseDto = {
 *   success: boolean;
 *   data: { access_token, refresh_token?, user: { id, username, email?, role } };
 *   message?: string;
 * }
 *
 * ProblemDto = {
 *   id, title, difficulty, acceptance_rate?, submission_count?,
 *   accepted_count?, is_practice_visible?, is_solved?, tags?, created_at?
 * }
 *
 * SubmissionDto = {
 *   id, problem, user, language, status, execution_time?,
 *   memory_usage?, created_at, contest?, is_test?
 * }
 *
 * ContestDto = {
 *   id, title, description, start_time, end_time, status,
 *   is_public?, password?, creator?, participants_count?
 * }
 */

/**
 * Helper to make API requests
 */
export async function apiRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...options.headers,
  };

  return fetch(url, { ...options, headers });
}

/**
 * Helper to make authenticated requests
 */
export async function authenticatedRequest(
  endpoint: string,
  token: string,
  options: RequestInit = {}
): Promise<Response> {
  return apiRequest(endpoint, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}

/**
 * Check if backend is available
 */
export async function isBackendAvailable(): Promise<boolean> {
  try {
    await fetch(`${API_BASE_URL}/api/v1/auth/email/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@test.com", password: "test" }),
    });
    // Any HTTP response means backend is available
    return true;
  } catch {
    return false;
  }
}

/**
 * Skip test if backend is not available
 */
export async function skipIfNoBackend(): Promise<boolean> {
  const available = await isBackendAvailable();
  if (!available) {
    console.log("⚠️ Skipping: Backend not available at " + API_BASE_URL);
  }
  return !available;
}

/**
 * Login and get access token for a user role
 */
export async function loginAs(
  role: UserRole
): Promise<{ token: string; user: unknown } | null> {
  try {
    const credentials = TEST_USERS[role];
    const res = await apiRequest("/api/v1/auth/email/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });

    if (res.status === 200) {
      const data = await res.json();
      return {
        token: data.data?.access_token,
        user: data.data?.user,
      };
    }
    return null;
  } catch {
    console.log(`⚠️ Could not login as ${role}`);
    return null;
  }
}

/**
 * Get tokens for all test users
 */
export async function getAllUserTokens(): Promise<
  Record<UserRole, string | null>
> {
  const tokens: Record<UserRole, string | null> = {
    student: null,
    teacher: null,
    admin: null,
  };

  for (const role of Object.keys(TEST_USERS) as UserRole[]) {
    const result = await loginAs(role);
    tokens[role] = result?.token || null;
  }

  return tokens;
}
