/**
 * E2E Tests for Authentication
 *
 * Tests login, registration, logout, and unauthorized access protection.
 * Note: NYCU SSO is not tested here as it requires external OAuth flow.
 */

import { test, expect } from "@playwright/test";
import {
  login,
  logout,
  clearAuth,
  isAuthenticated,
} from "../helpers/auth.helper";
import { TEST_USERS } from "../helpers/data.helper";

test.describe("Authentication E2E Tests", () => {
  // Use serial mode to avoid login conflicts
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    // Navigate to page first to be able to access localStorage
    await page.goto("/login");
    // Clear authentication before each test
    await clearAuth(page);
  });

  test.describe("Registration", () => {
    test("should register a new user successfully", async ({ page }) => {
      const timestamp = Date.now();
      const newUser = {
        email: `testuser${timestamp}@example.com`,
        username: `testuser${timestamp}`,
        password: "TestPass123!",
      };

      await page.goto("/register");

      // Verify we're on register page
      await expect(page).toHaveURL(/\/register/);

      // Fill registration form
      await page.fill("#username", newUser.username);
      await page.fill("#email", newUser.email);
      await page.fill("#password", newUser.password);
      await page.fill("#confirm-password", newUser.password);

      // Submit form
      await page.click('button[type="submit"]');

      // Should redirect to login or dashboard
      await Promise.race([
        page.waitForURL(/\/login/, { timeout: 15000 }),
        page.waitForURL(/\/dashboard/, { timeout: 15000 }),
      ]);

      // Verify we're not on register page anymore
      expect(page.url()).not.toContain("/register");
    });

    test("should show error when passwords do not match", async ({ page }) => {
      await page.goto("/register");

      // Fill with mismatched passwords
      await page.fill("#username", "testuser");
      await page.fill("#email", "test@example.com");
      await page.fill("#password", "Password123!");
      await page.fill("#confirm-password", "DifferentPassword123!");

      // Submit form
      await page.click('button[type="submit"]');

      // Should show error message (use specific selector)
      await expect(page.locator(".auth-error")).toBeVisible({ timeout: 5000 });

      // Should still be on register page
      await expect(page).toHaveURL(/\/register/);
    });

    test("should show error when email already exists", async ({ page }) => {
      await page.goto("/register");

      // Use existing student email
      await page.fill("#username", "newuser");
      await page.fill("#email", TEST_USERS.student.email);
      await page.fill("#password", "Password123!");
      await page.fill("#confirm-password", "Password123!");

      // Submit form
      await page.click('button[type="submit"]');

      // Should show error message (user already exists) - use specific selector
      await expect(page.locator(".auth-error")).toBeVisible({ timeout: 5000 });

      // Should still be on register page
      await expect(page).toHaveURL(/\/register/);
    });
  });

  test.describe("Login", () => {
    test("should login as student successfully", async ({ page }) => {
      await login(page, "student");

      // Verify we're on dashboard
      await expect(page).toHaveURL(/\/dashboard/);

      // Verify user is authenticated
      const authenticated = await isAuthenticated(page);
      expect(authenticated).toBe(true);
    });

    test("should login as teacher successfully", async ({ page }) => {
      await login(page, "teacher");

      await expect(page).toHaveURL(/\/dashboard/);

      const authenticated = await isAuthenticated(page);
      expect(authenticated).toBe(true);
    });

    test("should login as admin successfully", async ({ page }) => {
      await login(page, "admin");

      await expect(page).toHaveURL(/\/dashboard/);

      const authenticated = await isAuthenticated(page);
      expect(authenticated).toBe(true);
    });

    test("should show error with invalid credentials", async ({ page }) => {
      await page.goto("/login");

      // Fill with invalid credentials
      await page.fill("#email", "nonexistent@example.com");
      await page.fill("#password", "wrongpassword");

      // Submit form
      await page.click('button[type="submit"]');

      // Should show error message
      await expect(page.locator(".auth-error")).toBeVisible({ timeout: 5000 });

      // Should still be on login page
      await expect(page).toHaveURL(/\/login/);
    });

    test("should show error with wrong password for existing user", async ({
      page,
    }) => {
      await page.goto("/login");

      // Use existing email with wrong password
      await page.fill("#email", TEST_USERS.student.email);
      await page.fill("#password", "wrongpassword123");

      // Submit form
      await page.click('button[type="submit"]');

      // Should show error message
      await expect(page.locator(".auth-error")).toBeVisible({ timeout: 5000 });

      // Should still be on login page
      await expect(page).toHaveURL(/\/login/);
    });

    test("should show error with empty fields", async ({ page }) => {
      await page.goto("/login");

      // Click submit without filling anything
      await page.click('button[type="submit"]');

      // HTML5 validation should prevent submission or show error
      // Check that we're still on login page
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe("Logout", () => {
    test("should logout successfully", async ({ page }) => {
      // First login
      await login(page, "student");
      await expect(page).toHaveURL(/\/dashboard/);

      // Then logout
      await logout(page);

      // Should redirect to login page
      await expect(page).toHaveURL(/\/login/);

      // Verify user is not authenticated
      const authenticated = await isAuthenticated(page);
      expect(authenticated).toBe(false);
    });
  });

  test.describe("Session Management", () => {
    test("should protect unauthorized access to dashboard", async ({
      page,
    }) => {
      // Try to access dashboard without login
      await page.goto("/dashboard");

      // Should redirect to login page
      await page.waitForURL(/\/login/, { timeout: 5000 });
      await expect(page).toHaveURL(/\/login/);
    });

    test("should maintain session after page reload", async ({ page }) => {
      // Login
      await login(page, "student");
      await expect(page).toHaveURL(/\/dashboard/);

      // Reload page
      await page.reload();

      // Should still be logged in
      await expect(page).toHaveURL(/\/dashboard/);

      const authenticated = await isAuthenticated(page);
      expect(authenticated).toBe(true);
    });

    test("should store token in localStorage after login", async ({ page }) => {
      await login(page, "student");

      // Check localStorage for token
      const token = await page.evaluate(() => localStorage.getItem("token"));
      expect(token).toBeTruthy();
      expect(token!.length).toBeGreaterThan(10);
    });

    test("should clear token from localStorage after logout", async ({
      page,
    }) => {
      await login(page, "student");
      await expect(page).toHaveURL(/\/dashboard/);

      await logout(page);

      // Check localStorage is cleared
      const token = await page.evaluate(() => localStorage.getItem("token"));
      expect(token).toBeFalsy();
    });
  });

  test.describe("Navigation", () => {
    test("should navigate from login to register page", async ({ page }) => {
      await page.goto("/login");
      await expect(page).toHaveURL(/\/login/);

      // Click register link
      await page.click('a[href="/register"]');

      // Should be on register page
      await expect(page).toHaveURL(/\/register/);
    });

    test("should navigate from register to login page", async ({ page }) => {
      await page.goto("/register");
      await expect(page).toHaveURL(/\/register/);

      // Click login link
      await page.click('a[href="/login"]');

      // Should be on login page
      await expect(page).toHaveURL(/\/login/);
    });

    test("should redirect to login when accessing protected route while not authenticated", async ({
      page,
    }) => {
      // Try various protected routes
      const protectedRoutes = ["/dashboard", "/problems", "/contests"];

      for (const route of protectedRoutes) {
        await page.goto(route);
        // Should redirect to login
        await page.waitForURL(/\/login/, { timeout: 5000 });
      }
    });
  });
});
