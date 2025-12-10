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

  // Navigate to login page
  await page.goto("/login");

  // Fill in credentials
  await page.fill("#email", user.email);
  await page.fill("#password", user.password);

  // Submit form
  await page.click('button[type="submit"]');

  // Wait for navigation to dashboard
  await page.waitForURL(/\/dashboard/, { timeout: 10000 });

  // Verify login success by checking for user info or dashboard content
  await expect(page).toHaveURL(/\/dashboard/);
}

/**
 * Logout helper function
 *
 * @param page - Playwright page object
 */
export async function logout(page: Page) {
  // Click on user menu/avatar
  await page
    .click('[data-testid="user-menu"], .user-avatar, button:has-text("登出")')
    .catch(async () => {
      // If specific selectors don't work, try to find logout button anywhere
      const logoutButton = page
        .locator("button, a")
        .filter({ hasText: /登出|Logout/i });
      await logoutButton.first().click();
    });

  // Wait for redirect to login page
  await page.waitForURL(/\/login/, { timeout: 5000 });

  // Verify logout success
  await expect(page).toHaveURL(/\/login/);
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

  // Wait for navigation (could be to login or directly to dashboard)
  await Promise.race([
    page.waitForURL(/\/login/, { timeout: 10000 }),
    page.waitForURL(/\/dashboard/, { timeout: 10000 }),
  ]);
}

/**
 * Check if user is authenticated
 *
 * @param page - Playwright page object
 * @returns true if authenticated, false otherwise
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  try {
    // Try to access a protected route
    await page.goto("/dashboard");
    await page.waitForTimeout(1000);

    // If we're still on dashboard, user is authenticated
    const url = page.url();
    return url.includes("/dashboard");
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
  const token = data.data.access_token;

  // Set token in localStorage
  await page.goto("/");
  await setAuthToken(page, token);

  // Store user data
  await page.evaluate((userData) => {
    localStorage.setItem("user", JSON.stringify(userData));
  }, data.data.user);
}
