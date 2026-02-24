/**
 * Authentication Helper Functions
 *
 * This file contains helper functions for authentication-related operations in E2E tests.
 */

import { Page, expect } from "@playwright/test";
import { TEST_USERS } from "./data.helper";

export type UserRole = keyof typeof TEST_USERS;

/**
 * Login helper function
 *
 * @param page - Playwright page object
 * @param role - User role (admin, teacher, student, student2)
 */
export async function login(page: Page, role: UserRole = "student") {
  const user = TEST_USERS[role];

  const submitOnce = async () => {
    await page.goto("/login");
    await page.fill("#email", user.email);
    await page.fill("#password", user.password);
    await page.click('button[type="submit"]');
  };

  const waitForResult = async () => {
    await Promise.race([
      page.waitForFunction(
        () => window.location.pathname !== "/login",
        undefined,
        { timeout: 20000 }
      ),
      page.locator(".auth-error").waitFor({ state: "visible", timeout: 20000 }),
    ]);
  };

  // WebKit in CI can occasionally miss the first submit/navigation; retry once.
  await submitOnce();
  await waitForResult();

  if (!page.url().includes("/dashboard")) {
    await submitOnce();
    await waitForResult();
  }

  await expect(page).not.toHaveURL(/\/login/);
}

/**
 * Logout helper function
 *
 * @param page - Playwright page object
 */
export async function logout(page: Page) {
  const userMenuButton = page.getByRole("button", {
    name: /使用者選單|User Menu/i,
  });
  await userMenuButton.click({ timeout: 5000 });

  const logoutButton = page.getByRole("button", {
    name: /登出|Logout/i,
  });
  await logoutButton.first().click({ timeout: 5000 });

  // Unauthenticated users are redirected to landing page (/), legacy flows may still use /login
  await page.waitForFunction(
    () => ["/", "/login"].includes(window.location.pathname),
    undefined,
    { timeout: 10000 }
  );
  await expect(page).toHaveURL(/\/$|\/login/);
}

/**
 * Register a new user
 *
 * @param page - Playwright page object
 * @param email - User email
 * @param password - User password
 * @param username - Username
 */
export async function register(
  page: Page,
  email: string,
  password: string,
  username: string
) {
  // Navigate to register page
  await page.goto("/register");

  // Fill in registration form
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.fill("#username", username);

  // Submit form
  await page.click('button[type="submit"]');

  await page.waitForFunction(
    () => window.location.pathname !== "/register",
    undefined,
    { timeout: 20000 }
  );
}

/**
 * Check if user is authenticated
 *
 * @param page - Playwright page object
 * @returns true if authenticated, false otherwise
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  try {
    const hasUser = await page.evaluate(() => Boolean(localStorage.getItem("user")));
    if (!hasUser) return false;

    // Try to access a protected route
    await page.goto("/problems");
    await page.waitForTimeout(1000);

    const path = new URL(page.url()).pathname;
    return path.startsWith("/problems");
  } catch {
    return false;
  }
}

/**
 * Get authentication token from localStorage
 *
 * @param page - Playwright page object
 * @returns JWT token or null
 */
export async function getAuthToken(page: Page): Promise<string | null> {
  return await page.evaluate(() => localStorage.getItem("token"));
}

/**
 * Set authentication token in localStorage
 *
 * @param page - Playwright page object
 * @param token - JWT token
 */
export async function setAuthToken(page: Page, token: string) {
  await page.evaluate((token) => {
    localStorage.setItem("token", token);
  }, token);
}

/**
 * Clear authentication
 *
 * @param page - Playwright page object
 */
export async function clearAuth(page: Page) {
  await page.evaluate(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  });
}

/**
 * Login via API (faster than UI login)
 *
 * @param page - Playwright page object
 * @param role - User role
 */
export async function loginViaAPI(page: Page, role: UserRole = "student") {
  const user = TEST_USERS[role];

  // Make API request to login
  const response = await page.request.post("/api/v1/auth/email/login", {
    data: {
      email: user.email,
      password: user.password,
    },
  });

  expect(response.ok()).toBeTruthy();

  const data = await response.json();
  const token = data?.data?.access_token as string | undefined;

  // Set token in localStorage
  await page.goto("/");
  if (token) {
    await setAuthToken(page, token);
  }

  // Store user data
  const userData = data?.data?.user;
  await page.evaluate((payload) => {
    if (payload) {
      localStorage.setItem("user", JSON.stringify(payload));
    }
  }, userData);
}
